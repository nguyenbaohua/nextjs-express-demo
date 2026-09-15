/*
 * ============================================================================
 * AUTH CONTROLLER — trạm trung chuyển giữa HTTP và service
 * ============================================================================
 *
 * Controller ở đây làm đúng ba việc, không hơn (giống hệt todo.controller.ts):
 *   1. Validate dữ liệu vào bằng zod
 *   2. Gọi service
 *   3. Định dạng response
 *
 * Nó KHÔNG biết Cognito là gì. Toàn bộ hiểu biết về Cognito nằm trong service.
 * Nhờ ranh giới đó, đọc file này bạn nắm được "API có những gì" mà không bị chi
 * tiết kỹ thuật của AWS làm phân tâm.
 *
 * Mọi hàm đều bọc trong `try/catch` rồi `next(err)`. Đây không phải thói quen
 * thừa: trong Express, lỗi ném ra từ hàm `async` mà không bắt sẽ KHÔNG tự động
 * đi tới errorHandler — request sẽ treo cho tới lúc timeout.
 */

import { NextFunction, Request, Response } from "express";
import * as authService from "../services/auth.service";
import {
  confirmSchema,
  googleAuthorizeUrlSchema,
  googleCallbackSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resendCodeSchema,
} from "../schemas/auth.schema";
import { AppError } from "../utils/AppError";

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = registerSchema.parse(req.body);
    await authService.register(email, password);
    /*
     * 201 Created — đã tạo tài khoản.
     *
     * Response cố tình KHÔNG chứa token, vì tài khoản chưa xác thực email thì
     * chưa được phép làm gì. Thay vào đó ta trả về `email` để frontend điền sẵn
     * vào ô nhập ở trang xác thực — một chi tiết nhỏ nhưng đỡ cho người dùng một
     * lần gõ lại.
     */
    res.status(201).json({
      success: true,
      data: { email },
      message: "Đăng ký thành công. Kiểm tra email để lấy mã xác thực.",
    });
  } catch (err) {
    next(err);
  }
}

export async function confirm(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, code } = confirmSchema.parse(req.body);
    await authService.confirmRegistration(email, code);
    res.json({
      success: true,
      data: { email },
      message: "Xác thực thành công. Bạn có thể đăng nhập ngay bây giờ.",
    });
  } catch (err) {
    next(err);
  }
}

export async function resendCode(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = resendCodeSchema.parse(req.body);
    await authService.resendConfirmationCode(email);
    res.json({ success: true, data: { email }, message: "Đã gửi lại mã xác thực." });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await authService.login(email, password);
    /*
     * Trả cả ba token về cho Next.js.
     *
     * Nghe có vẻ nguy hiểm, nhưng hãy nhìn kỹ ai là người nhận: đây là request từ
     * SERVER Next.js sang server Express, chạy hoàn toàn trong nội bộ. Trình duyệt
     * không nhìn thấy response này.
     *
     * Ngay sau đó Next.js cất token vào cookie `httpOnly`, nên JavaScript phía
     * trình duyệt cũng không đọc được. Token đi qua đúng hai chặng server, không
     * bao giờ lộ ra tầng script của trang web.
     */
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/*
 * POST /api/auth/refresh — gia hạn phiên đăng nhập.
 *
 * Đây là chỗ DUY NHẤT trong controller phải phân biệt hai loại phiên. Lý do rất
 * cụ thể: Cognito cung cấp hai đường gia hạn khác nhau, và mỗi loại phiên chỉ đi
 * được đúng một đường (xem `auth.service.ts` để hiểu vì sao).
 *
 * Nhìn kỹ sẽ thấy đây là ví dụ đẹp về việc controller làm ĐÚNG PHẦN VIỆC CỦA NÓ:
 * nó chỉ ĐIỀU PHỐI — đọc dữ liệu vào rồi chọn gọi hàm nào. Toàn bộ hiểu biết về
 * "gia hạn thế nào" vẫn nằm trong service. Controller không hề biết Hosted UI
 * hay SECRET_HASH là cái gì.
 */
export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken, provider, username } = refreshSchema.parse(req.body);

    /*
     * Nhánh Google: gọn hơn hẳn vì endpoint /oauth2/token không đòi username.
     * Thoát sớm bằng `return` để phần dưới khỏi phải lồng thêm một tầng `else`.
     */
    if (provider === "google") {
      const result = await authService.refreshTokensWithHostedUi(refreshToken);
      res.json({ success: true, data: result });
      return;
    }

    /*
     * Nhánh email + mật khẩu (mặc định khi `provider` vắng mặt — xem lời giải
     * thích về tương thích ngược trong `auth.schema.ts`).
     *
     * `username` là tên đăng nhập thật trong Cognito, cần để tính SECRET_HASH.
     * Xem lời giải thích dài trong `auth.service.ts` — đây là cái bẫy khó chịu
     * nhất của luồng refresh.
     */
    if (!username) {
      throw new AppError(400, "Thiếu username để làm mới phiên đăng nhập.");
    }
    const result = await authService.refreshTokens(refreshToken, username);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/*
 * ============================================================================
 * HAI ROUTE CỦA LUỒNG ĐĂNG NHẬP BẰNG GOOGLE
 * ============================================================================
 *
 * Luồng OAuth có hai chặng tách rời nhau, cách nhau vài giây và vài lần chuyển
 * trang, nên cần đúng hai endpoint:
 *
 *   1. `googleAuthorizeUrl` — "cho tôi xin cái địa chỉ để đá người dùng đi"
 *      (chạy TRƯỚC khi người dùng rời khỏi app)
 *
 *   2. `googleCallback` — "đây là tấm phiếu họ mang về, đổi giúp tôi lấy token"
 *      (chạy SAU khi người dùng quay lại)
 *
 * Giữa hai lời gọi đó, người dùng đã đi một vòng qua Cognito và Google. Server
 * của ta không giữ trạng thái gì trong lúc đó cả — thứ nối hai chặng lại với
 * nhau là `state` nằm trong cookie của trình duyệt.
 */

/**
 * GET /api/auth/google/url?redirectUri=...&state=...
 *
 * Trả về URL Hosted UI để frontend chuyển hướng người dùng tới.
 *
 * Vì sao là GET mà không phải POST? Vì nó KHÔNG thay đổi gì cả — chỉ nối chuỗi
 * rồi trả về. Đó đúng định nghĩa của một request "an toàn" (safe) trong HTTP.
 * Dùng đúng động từ giúp người đọc code đoán được hành vi mà không cần mở ra xem.
 *
 * Chú ý ta parse `req.query` chứ không phải `req.body`: request GET không có
 * body, dữ liệu nằm trên URL sau dấu `?`.
 */
export async function googleAuthorizeUrl(req: Request, res: Response, next: NextFunction) {
  try {
    const { redirectUri, state } = googleAuthorizeUrlSchema.parse(req.query);
    const url = authService.buildGoogleAuthorizeUrl(redirectUri, state);
    res.json({ success: true, data: { url } });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/google/callback
 *
 * Đổi `code` (tấm phiếu dùng-một-lần từ Cognito) lấy bộ ba token.
 *
 * Response có cấu trúc GIỐNG HỆT `POST /api/auth/login`. Đó là chủ ý thiết kế:
 * frontend nhận về cùng một hình dạng dữ liệu nên phần lưu cookie dùng chung
 * được y nguyên, không cần viết thêm nhánh xử lý riêng cho Google.
 *
 * Nguyên tắc đáng nhớ: khi thêm một cách làm MỚI cho một việc CŨ, hãy cố cho nó
 * trả về cùng kiểu dữ liệu với cách cũ. Chỗ khác biệt càng ít thì code càng ít
 * chỗ phải rẽ nhánh.
 */
export async function googleCallback(req: Request, res: Response, next: NextFunction) {
  try {
    const { code, redirectUri } = googleCallbackSchema.parse(req.body);
    const result = await authService.loginWithGoogle(code, redirectUri);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/*
 * GET /api/auth/me — "token tôi đang cầm còn dùng được không, và tôi là ai?"
 *
 * Route này nằm SAU `requireAuth`, nên nếu chạy được tới dòng đầu tiên thì token
 * chắc chắn đã hợp lệ. Không cần kiểm tra gì thêm, chỉ việc trả lại thông tin mà
 * middleware đã gắn vào request.
 *
 * Dấu `!` trong `req.user!` nói với TypeScript: "tôi biết chắc chỗ này có giá
 * trị". Ta dám khẳng định vì đã đọc file routes và biết `requireAuth` đứng trước.
 * Đây là một trong số ít trường hợp `!` chính đáng — lập trình viên nắm thông tin
 * mà trình biên dịch không thể tự suy ra được.
 */
export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: req.user! });
  } catch (err) {
    next(err);
  }
}
