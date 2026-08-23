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

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    /*
     * `username` là tên đăng nhập thật trong Cognito, cần để tính SECRET_HASH.
     * Xem lời giải thích dài trong `auth.service.ts` — đây là cái bẫy khó chịu
     * nhất của luồng refresh.
     */
    const username = String(req.body?.username ?? "").trim();
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
