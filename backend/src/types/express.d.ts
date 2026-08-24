/*
 * ============================================================================
 * MỞ RỘNG KIỂU DỮ LIỆU CỦA EXPRESS
 * ============================================================================
 *
 * Vấn đề: middleware `requireAuth` gắn thêm `req.user` vào request. Nhưng
 * TypeScript nhìn vào định nghĩa gốc của Express thì không thấy thuộc tính đó,
 * nên nó báo lỗi "Property 'user' does not exist on type 'Request'".
 *
 * Cách sai (nhưng rất phổ biến): ép kiểu `(req as any).user`. Chạy được, nhưng
 * `any` tắt toàn bộ kiểm tra kiểu ở chỗ đó — gõ nhầm `req.user.subb` cũng không
 * ai báo, và bug chỉ lộ ra lúc chạy.
 *
 * Cách đúng: "declaration merging". TypeScript cho phép ta khai báo BỔ SUNG vào
 * một interface đã có sẵn ở thư viện khác. Khai báo dưới đây được TypeScript
 * gộp vào interface `Request` gốc của Express, nên `req.user` trở thành một
 * thuộc tính hợp lệ, có kiểu đầy đủ, ở mọi file trong dự án.
 *
 * File có đuôi `.d.ts` nghĩa là "declaration file" — chỉ chứa thông tin về kiểu,
 * không sinh ra dòng JavaScript nào khi biên dịch.
 */

declare global {
  namespace Express {
    interface Request {
      /*
       * Dấu `?` là bắt buộc và mang ý nghĩa thật.
       *
       * Không phải request nào cũng đi qua `requireAuth` — `POST /api/auth/login`
       * chẳng hạn thì không. Với những request đó `req.user` là undefined, và dấu
       * `?` buộc bạn phải kiểm tra trước khi dùng. TypeScript ở đây đang phản ánh
       * đúng sự thật, không phải làm phiền.
       */
      user?: {
        /**
         * `User.id` trong database của ta — ĐÂY mới là giá trị nằm ở `Todo.userId`.
         *
         * ⚠️ Đừng nhầm với `sub` bên dưới. Phân biệt cho rõ:
         *
         *   id  → "CON NGƯỜI nào".  Một người luôn có đúng một `id`.
         *   sub → "TÀI KHOẢN COGNITO nào". Cùng một người có thể có HAI `sub`:
         *         một của tài khoản email + mật khẩu, một của tài khoản Google.
         *
         * Dùng nhầm `sub` thay cho `id` khi query todo sẽ tạo ra một bug rất khó
         * chịu: người dùng đăng nhập bằng Google không thấy todo đã tạo lúc đăng
         * nhập bằng mật khẩu, dù đó là cùng một tài khoản.
         */
        id: string;
        /** Email lấy từ bảng `User` — tiện cho việc ghi log và hiển thị. */
        email: string;
        /** `sub` của Cognito, đọc ra từ chữ ký của access token. */
        sub: string;
        /** Tên đăng nhập thật trong Cognito (thường là UUID khi đăng nhập bằng email) */
        username: string;
      };
    }
  }
}

/*
 * `export {}` biến file này thành một module.
 *
 * Nghe vô lý vì file không export gì cả, nhưng đây là quy tắc của TypeScript:
 * chỉ trong một module thì `declare global` mới có tác dụng. Thiếu dòng này,
 * TypeScript coi file là script toàn cục và phần khai báo trên bị lờ đi.
 */
export {};
