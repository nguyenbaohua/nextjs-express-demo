/*
 * ============================================================================
 * GỌI API XÁC THỰC — ánh xạ 1-1 với `backend/src/routes/auth.routes.ts`
 * ============================================================================
 *
 * Điều đáng chú ý nhất ở file này: sự phân chia giữa `publicRequest` và
 * `request` KHÔNG phải ngẫu nhiên. Nó phản chiếu chính xác cách backend chia
 * route thành hai nhóm.
 *
 *     publicRequest  →  nhóm CÔNG KHAI bên backend (register, login, refresh, logout)
 *     request        →  nhóm sau `requireAuth`      (me)
 *
 * Hai file ở hai tiến trình khác nhau, nhưng cùng mô tả một ranh giới. Khi đọc
 * code, sự tương ứng như vậy là thứ giúp bạn tin rằng mình đã hiểu đúng hệ
 * thống — và khi nó LỆCH nhau, đó thường là dấu hiệu của một lỗi thật.
 */

import { publicRequest, request } from "@/shared/api/http";
import type { AuthSession, SessionUser } from "@/shared/lib/session";

/**
 * POST /api/auth/register — tạo tài khoản.
 *
 * Chú ý kiểu trả về KHÔNG phải `AuthSession`: đăng ký xong chưa có token, người
 * dùng vẫn phải đăng nhập. Backend cố ý thiết kế vậy (xem `auth.service.ts` bên
 * backend), và kiểu dữ liệu ở đây phản ánh đúng sự thật đó.
 *
 * Nếu khai nhầm là `AuthSession`, TypeScript sẽ vui vẻ cho bạn viết
 * `result.accessToken` và bạn nhận về `undefined` lúc chạy. Kiểu dữ liệu chỉ
 * bảo vệ bạn khi nó nói thật.
 */
export function register(email: string, password: string) {
  return publicRequest<{ id: string; email: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

/**
 * POST /api/auth/login — đổi email + mật khẩu lấy cặp token.
 *
 * ⚠️ Mật khẩu đi trong body của một request POST, KHÔNG nằm trên URL. Điều này
 * bắt buộc, và lý do rất cụ thể: URL bị ghi lại ở khắp nơi — trong lịch sử trình
 * duyệt, trong log của mọi proxy và load balancer trên đường đi, trong header
 * `Referer` gửi sang trang khác. Body của POST thì không.
 *
 * Đó cũng là lý do bạn không bao giờ được thấy một API dạng
 * `GET /login?password=...` trong code nghiêm túc.
 */
export function login(email: string, password: string) {
  return publicRequest<AuthSession>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

/**
 * POST /api/auth/refresh — đổi refresh token lấy cặp token mới.
 *
 * Hàm này được `proxy.ts` gọi (gián tiếp, bằng `fetch` thẳng — xem lời giải
 * thích tại đó về lý do không dùng lại hàm này).
 *
 * ⚠️ Response chứa một `refreshToken` MỚI, không phải chuỗi vừa gửi lên: backend
 * xoay vòng token ở mỗi lần gia hạn. Phải ghi đè cookie bằng giá trị mới, giữ
 * lại chuỗi cũ thì lần gia hạn kế tiếp sẽ thất bại.
 */
export function refreshSession(refreshToken: string) {
  return publicRequest<AuthSession>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
}

/**
 * POST /api/auth/logout — báo backend xoá phiên khỏi bảng `Session`.
 *
 * Đây là thứ khiến nút "Đăng xuất" có hiệu lực THẬT, chứ không chỉ là xoá cookie
 * ở phía trình duyệt. Xoá cookie thì người dùng không gửi token nữa; xoá hàng
 * trong database thì token đó không dùng được nữa, kể cả với người đã sao chép
 * nó ra chỗ khác.
 *
 * Dùng `publicRequest` vì route này bên backend cũng công khai — lý do nằm ở
 * `backend/src/controllers/auth.controller.ts`: lúc cần đăng xuất nhất thường
 * lại là lúc access token đã hết hạn.
 */
export function logout(refreshToken: string) {
  return publicRequest<unknown>("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
}

/**
 * GET /api/auth/me — kiểm tra nhanh "phiên còn sống không, và tôi là ai".
 *
 * Dùng `request` (có kèm token) vì route này nằm sau `requireAuth`.
 */
export function getMe() {
  return request<SessionUser>("/auth/me");
}
