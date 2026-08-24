/*
 * ============================================================================
 * ROUTES XÁC THỰC — bản đồ các URL của phần đăng nhập
 * ============================================================================
 *
 * Điểm cần chú ý nhất khi đọc file này: các route được chia làm HAI NHÓM.
 *
 *   NHÓM CÔNG KHAI — ai cũng gọi được, không cần token.
 *     Bắt buộc phải công khai, vì đây chính là những cánh cửa để người chưa có
 *     token đi vào. Bắt phải đăng nhập mới được gọi API đăng nhập thì thành ra
 *     con gà và quả trứng.
 *
 *   NHÓM CẦN TOKEN — nằm sau `requireAuth`.
 *
 * Trong Express, THỨ TỰ KHAI BÁO QUYẾT ĐỊNH TẤT CẢ: một middleware chỉ ảnh
 * hưởng tới những route được khai báo SAU nó. Đảo thứ tự vài dòng là thay đổi
 * hoàn toàn ai được vào ai không — nên ranh giới hai nhóm được đánh dấu rõ ở
 * dưới đây.
 */

import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

/* ---------- NHÓM CÔNG KHAI: không cần token ---------- */

/** POST /api/auth/register — tạo tài khoản, Cognito gửi mã 6 số về email */
router.post("/register", authController.register);

/** POST /api/auth/confirm — nhập mã 6 số để kích hoạt tài khoản */
router.post("/confirm", authController.confirm);

/** POST /api/auth/resend-code — gửi lại mã (email vào Spam / mã hết hạn) */
router.post("/resend-code", authController.resendCode);

/** POST /api/auth/login — đổi email + mật khẩu lấy 3 token */
router.post("/login", authController.login);

/*
 * POST /api/auth/refresh — đổi refresh token lấy access token mới.
 *
 * Vì sao route này nằm ở nhóm CÔNG KHAI?
 *   Vì nó được gọi đúng vào lúc access token đã hết hạn. Nếu đặt sau
 *   `requireAuth`, nó sẽ bị chặn ở đúng tình huống duy nhất mà nó tồn tại để
 *   phục vụ — vô dụng hoàn toàn.
 *
 * Vậy nó có sơ hở không? Không. Thứ bảo vệ route này là chính refresh token:
 * gửi lên chuỗi bậy thì Cognito từ chối ngay. "Công khai" ở đây nghĩa là không
 * cần ACCESS token, chứ không phải không cần bằng chứng gì cả.
 */
router.post("/refresh", authController.refresh);

/*
 * ---------- Đăng nhập bằng Google (OAuth 2.0) ----------
 *
 * Hai route này cũng nằm ở nhóm CÔNG KHAI, và vì đúng cái lý do đã nói ở đầu
 * file: chúng là cửa để người CHƯA có token đi vào. Bắt phải đăng nhập mới được
 * gọi API đăng nhập thì lại thành con gà và quả trứng.
 *
 * Điểm cần chú ý: cả hai đều được gọi bởi SERVER Next.js, không phải bởi trình
 * duyệt. Trình duyệt chỉ nói chuyện với Next.js và với Cognito — nó không bao giờ
 * gọi thẳng cổng 3000. Nhờ vậy `code` và token không bao giờ lộ ra tầng script
 * của trang web.
 */

/** GET /api/auth/google/url — xin URL Hosted UI để đá người dùng sang Google */
router.get("/google/url", authController.googleAuthorizeUrl);

/** POST /api/auth/google/callback — đổi `code` Cognito trả về lấy 3 token */
router.post("/google/callback", authController.googleCallback);

/* ---------- NHÓM CẦN TOKEN: mọi route dưới đây đều qua requireAuth ---------- */

/**
 * GET /api/auth/me — trả về danh tính đọc từ token.
 * Frontend dùng để kiểm tra nhanh "phiên đăng nhập còn sống không".
 */
router.get("/me", requireAuth, authController.me);

export default router;
