/*
 * ============================================================================
 * AUTH CONTROLLER — trạm trung chuyển giữa HTTP và service
 * ============================================================================
 *
 * Controller ở đây làm đúng ba việc, không hơn (giống hệt `todo.controller.ts`):
 *   1. Validate dữ liệu vào bằng zod
 *   2. Gọi service
 *   3. Định dạng response
 *
 * Nó KHÔNG biết bcrypt là gì, không biết JWT được ký thế nào, không biết bảng
 * `Session` tồn tại. Toàn bộ hiểu biết đó nằm trong service.
 *
 * Nhờ ranh giới đó, đọc file này bạn nắm được "API có những gì và trả về cái
 * gì" trong khoảng một phút, mà không bị chi tiết mật mã học làm phân tâm. Đó
 * chính là lợi ích thực tế của việc phân tầng: mỗi file trả lời đúng một loại
 * câu hỏi.
 *
 * ----------------------------------------------------------------------------
 * VÌ SAO MỌI HÀM ĐỀU CÓ `try/catch` RỒI `next(err)`?
 * ----------------------------------------------------------------------------
 * Đây là khuôn mẫu bắt buộc phải quen khi viết Express.
 *
 * Trong Express 4, lỗi ném ra từ một hàm `async` mà không ai bắt sẽ KHÔNG tự
 * động đi tới `errorHandler`. Nó trở thành một "unhandled promise rejection",
 * và request treo lơ lửng cho tới khi trình duyệt bỏ cuộc — không có phản hồi,
 * không có thông báo lỗi, chỉ có một vòng xoay bất tận.
 *
 * Express 5 (bản dùng ở đây) ĐÃ tự bắt giúp. Nhưng ta vẫn viết tường minh vì
 * hai lý do: ý đồ hiện rõ cho người đọc, và bạn sẽ gặp lại khuôn này ở gần như
 * mọi dự án Express ngoài kia — kể cả những dự án còn dùng Express 4.
 */

import { NextFunction, Request, Response } from "express";
import * as authService from "../services/auth.service";
import {
  loginSchema,
  refreshTokenSchema,
  registerSchema,
} from "../schemas/auth.schema";

/**
 * POST /api/auth/register
 *
 * Trả về 201 Created và KHÔNG kèm token — đăng ký xong vẫn phải đăng nhập.
 *
 * Vì sao 201 mà không phải 200? Vì 201 mang thêm thông tin: "một tài nguyên MỚI
 * vừa được tạo ra". Dùng đúng mã status giúp người đọc log, người viết client,
 * và cả các công cụ tự động hiểu chuyện gì vừa xảy ra mà không cần đọc body.
 *
 * Nhắc lại chi tiết quan trọng: service đã dùng `select` để chỉ lấy `id` và
 * `email`, nên `user` ở đây KHÔNG chứa `passwordHash`. Nếu không có bước đó,
 * dòng `res.json` ngay dưới đây sẽ vô tình công bố chuỗi hash mật khẩu ra mạng.
 *
 * Bài học chung: response của API là nơi dữ liệu RỜI KHỎI hệ thống của bạn.
 * Hãy luôn biết chính xác cái gì đang đi ra.
 */
export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = registerSchema.parse(req.body);
    const user = await authService.register(email, password);

    res.status(201).json({
      success: true,
      data: user,
      message: "Đăng ký thành công. Bạn có thể đăng nhập ngay bây giờ.",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 *
 * Trả cả cặp token về cho Next.js.
 *
 * Nghe có vẻ nguy hiểm, nhưng hãy nhìn kỹ AI là người nhận: đây là request từ
 * SERVER Next.js sang server Express, chạy hoàn toàn trong nội bộ. Trình duyệt
 * không nhìn thấy response này.
 *
 * Ngay sau đó Next.js cất token vào cookie `httpOnly`, nên JavaScript phía
 * trình duyệt cũng không đọc được. Token đi qua đúng hai chặng server, không bao
 * giờ lộ ra tầng script của trang web.
 *
 * Đây là điểm mấu chốt khiến kiến trúc "trình duyệt → Next.js → Express" đáng
 * giá: nó tạo ra một chỗ an toàn để cất token mà một ứng dụng React thuần
 * (chạy hoàn toàn trong trình duyệt) không hề có.
 */
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const session = await authService.login(email, password);

    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/refresh
 *
 * Đổi refresh token cũ lấy cặp token mới. Response có hình dạng GIỐNG HỆT
 * `/login` — chủ ý thiết kế, để frontend dùng chung một hàm lưu cookie cho cả
 * hai trường hợp (xem `AuthSession` trong `auth.service.ts`).
 *
 * ⚠️ Chú ý `refreshToken` trong response là một chuỗi MỚI, không phải chuỗi
 * client vừa gửi lên — vì service xoay vòng token ở mỗi lần gia hạn. Frontend
 * BẮT BUỘC phải ghi đè cookie bằng giá trị mới này; giữ lại chuỗi cũ thì lần
 * gia hạn kế tiếp sẽ thất bại và người dùng bị đá ra.
 */
export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = refreshTokenSchema.parse(req.body);
    const session = await authService.refresh(refreshToken);

    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/logout
 *
 * Xoá phiên khỏi database.
 *
 * Route này KHÔNG nằm sau `requireAuth`, và đó là một quyết định có chủ ý chứ
 * không phải bỏ sót. Lý do: tình huống cần đăng xuất nhất thường lại là tình
 * huống access token đã hết hạn. Bắt phải có access token hợp lệ mới cho đăng
 * xuất thì đúng lúc cần nhất lại không dùng được.
 *
 * Có sơ hở không? Rất ít. Thứ bảo vệ route này là chính refresh token: không có
 * nó thì không xoá được phiên nào. Kịch bản xấu nhất là ai đó cầm được refresh
 * token của bạn và... đăng xuất hộ bạn. Phiền, nhưng không mất mát gì — mà nếu
 * hắn đã cầm được refresh token thì hắn có việc khác đáng làm hơn nhiều.
 *
 * Nguyên tắc rút ra: "cần đăng nhập" không phải lúc nào cũng là câu trả lời an
 * toàn hơn. Hãy hỏi cụ thể: route này bảo vệ cái gì, và ai bị thiệt nếu nó mở?
 *
 * Trả về 200 kể cả khi không xoá được hàng nào — xem phần bàn về tính idempotent
 * trong `auth.service.ts`.
 */
export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = refreshTokenSchema.parse(req.body);
    await authService.logout(refreshToken);

    res.json({ success: true, message: "Đã đăng xuất." });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me — "token tôi đang cầm còn dùng được không, và tôi là ai?"
 *
 * Route này nằm SAU `requireAuth`, nên nếu chạy được tới dòng đầu tiên thì token
 * chắc chắn đã hợp lệ. Không cần kiểm tra gì thêm, chỉ việc trả lại thông tin mà
 * middleware đã gắn vào request.
 *
 * Dấu `!` trong `req.user!` nói với TypeScript: "tôi biết chắc chỗ này có giá
 * trị". Ta dám khẳng định vì đã đọc file routes và biết `requireAuth` đứng
 * trước. Đây là một trong số ít trường hợp `!` chính đáng — lập trình viên nắm
 * thông tin mà trình biên dịch không thể tự suy ra được.
 *
 * (Nhưng hãy cẩn thận với nó: nếu ai đó gỡ `requireAuth` khỏi route này, dấu `!`
 * sẽ im lặng nói dối và code nổ lúc chạy. `!` là một lời hứa của bạn với trình
 * biên dịch — đừng hứa những gì file khác có thể phá vỡ mà bạn không hay biết.)
 */
export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: req.user! });
  } catch (err) {
    next(err);
  }
}
