/*
 * ============================================================================
 * ROUTES XÁC THỰC — bản đồ các URL của phần đăng nhập
 * ============================================================================
 *
 * Điểm cần chú ý nhất khi đọc file này: các route được chia làm HAI NHÓM.
 *
 *   NHÓM CÔNG KHAI — ai cũng gọi được, không cần token.
 *     Bắt buộc phải công khai, vì đây chính là những cánh cửa để người CHƯA có
 *     token đi vào. Bắt phải đăng nhập mới được gọi API đăng nhập thì thành ra
 *     con gà và quả trứng.
 *
 *   NHÓM CẦN TOKEN — nằm sau `requireAuth`.
 *
 * Trong Express, THỨ TỰ KHAI BÁO QUYẾT ĐỊNH TẤT CẢ: một middleware chỉ ảnh
 * hưởng tới những route được khai báo SAU nó. Đảo thứ tự vài dòng là thay đổi
 * hoàn toàn ai được vào ai không — nên ranh giới hai nhóm được đánh dấu rõ ở
 * dưới đây.
 *
 * ----------------------------------------------------------------------------
 * VÌ SAO FILE ROUTES ĐÁNG ĐỌC ĐẦU TIÊN KHI TIẾP CẬN MỘT BACKEND LẠ?
 * ----------------------------------------------------------------------------
 * Vì nó là mục lục. Trong 30 giây bạn biết hệ thống có những API nào, dùng động
 * từ HTTP gì, và cái nào cần đăng nhập. Không file nào khác cho bạn bức tranh
 * đó nhanh bằng.
 *
 * Đó cũng là lý do ta cố giữ file này MỎNG: chỉ có ánh xạ URL → hàm, không có
 * một dòng logic nào. Hễ thấy `if` hay `await` lọt vào file routes là dấu hiệu
 * có thứ gì đó đang nằm sai tầng.
 */

import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

/* ---------- NHÓM CÔNG KHAI: không cần token ---------- */

/** POST /api/auth/register — tạo tài khoản mới (email + mật khẩu) */
router.post("/register", authController.register);

/** POST /api/auth/login — đổi email + mật khẩu lấy cặp token */
router.post("/login", authController.login);

/*
 * POST /api/auth/refresh — đổi refresh token lấy cặp token mới.
 *
 * Vì sao route này nằm ở nhóm CÔNG KHAI?
 *   Vì nó được gọi đúng vào lúc access token đã hết hạn. Nếu đặt sau
 *   `requireAuth`, nó sẽ bị chặn ở đúng tình huống duy nhất mà nó tồn tại để
 *   phục vụ — vô dụng hoàn toàn.
 *
 * Vậy nó có sơ hở không? Không. Thứ bảo vệ route này là chính refresh token:
 * gửi lên chuỗi bậy thì không tìm thấy hàng nào trong bảng `Session` và nhận
 * ngay 401. "Công khai" ở đây nghĩa là không cần ACCESS token, chứ không phải
 * không cần bằng chứng gì cả.
 */
router.post("/refresh", authController.refresh);

/*
 * POST /api/auth/logout — đóng phiên.
 *
 * Cũng công khai, và cũng vì đúng lý do của `/refresh`: lúc cần đăng xuất nhất
 * thường là lúc access token đã hết hạn. Lý do đầy đủ nằm trong
 * `auth.controller.ts`.
 *
 * Vì sao là POST mà không phải GET, khi nó chẳng "tạo" ra cái gì?
 *   Vì nó THAY ĐỔI TRẠNG THÁI của hệ thống (xoá một hàng trong database). Theo
 *   chuẩn HTTP, GET phải là thao tác "an toàn" — không gây ra tác dụng phụ nào.
 *
 *   Đây không chỉ là chuyện học thuật. Trình duyệt và proxy được phép tự ý gọi
 *   trước các URL GET để tải sẵn cho nhanh. Đặt logout ở GET thì chỉ cần một
 *   thẻ `<img src="/api/auth/logout">` trên trang bất kỳ cũng đá được người
 *   dùng ra — và đã có những trang web thật dính đúng lỗi này.
 */
router.post("/logout", authController.logout);

/* ---------- NHÓM CẦN TOKEN: mọi route dưới đây đều qua requireAuth ---------- */

/**
 * GET /api/auth/me — trả về danh tính đọc từ token.
 * Frontend dùng để kiểm tra nhanh "phiên đăng nhập còn sống không".
 *
 * Ở đây `requireAuth` được gắn cho RIÊNG route này (tham số thứ hai) chứ không
 * dùng `router.use(...)` như bên `todo.routes.ts`. Khác biệt có lý do:
 *
 *   - File này: phần lớn route là công khai, chỉ vài route cần token → gắn lẻ,
 *     để nhìn một dòng là biết ngay route đó có được bảo vệ không.
 *   - `todo.routes.ts`: TOÀN BỘ route cần token → dùng `router.use(requireAuth)`
 *     một lần, và mọi route thêm về sau TỰ ĐỘNG được bảo vệ mà không cần ai nhớ.
 *
 * Nguyên tắc chọn: khi "cần bảo vệ" là NGOẠI LỆ thì gắn lẻ cho rõ ràng; khi nó
 * là QUY TẮC thì gắn chung để không ai quên được.
 */
router.get("/me", requireAuth, authController.me);

export default router;
