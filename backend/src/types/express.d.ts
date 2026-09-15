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
 * `any` tắt toàn bộ kiểm tra kiểu ở chỗ đó — gõ nhầm `req.user.idd` cũng không
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
       * chẳng hạn thì không. Với những request đó `req.user` là `undefined`, và
       * dấu `?` buộc bạn phải kiểm tra trước khi dùng. TypeScript ở đây đang
       * phản ánh đúng sự thật, không phải làm phiền.
       *
       * ---------------------------------------------------------------------
       * VÌ SAO HÌNH DẠNG NÀY TRÙNG KHỚP VỚI `AccessTokenPayload`?
       * ---------------------------------------------------------------------
       * Không phải trùng hợp: `requireAuth` lấy thẳng nội dung đã giải mã từ
       * token gán vào đây. Hai nơi khai báo cùng một hình dạng vì chúng mô tả
       * cùng một dữ liệu.
       *
       * Vậy sao không `import` lại kiểu từ `lib/jwt.ts` cho khỏi lặp?
       *
       *   Vì file `.d.ts` chứa `declare global` có một luật hơi trái khoáy: thêm
       *   một câu `import` ở ĐẦU file sẽ biến nó thành module, và khi đó
       *   `declare global` chỉ còn tác dụng nếu viết đúng cách. Có cú pháp để
       *   làm được (dùng `import(...)` ngay trong chỗ khai kiểu), nhưng nó khó
       *   đọc hơn hẳn với người mới.
       *
       *   Ở quy mô hai trường như thế này, lặp lại rõ ràng dễ hiểu hơn là tiết
       *   kiệm bằng một cú pháp lắt léo. Đây là một đánh đổi có ý thức, không
       *   phải sự cẩu thả — và nó minh hoạ một điều: "đừng lặp code" là hướng
       *   dẫn tốt, nhưng không phải luật thiêng liêng.
       */
      user?: {
        /**
         * `User.id` trong database — ĐÂY là giá trị nằm ở cột `Todo.userId`.
         *
         * Mọi câu query todo đều dùng nó, và nó đến từ bên trong access token đã
         * kiểm chữ ký. Client không có cách nào can thiệp vào giá trị này.
         */
        id: string;
        /** Email — tiện cho việc hiển thị và ghi log. */
        email: string;
      };
    }
  }
}

/*
 * `export {}` biến file này thành một module.
 *
 * Nghe vô lý vì file không export gì cả, nhưng đây là quy tắc của TypeScript:
 * chỉ trong một module thì `declare global` mới có tác dụng. Thiếu dòng này,
 * TypeScript coi file là script toàn cục và phần khai báo trên bị lờ đi — mà
 * lờ đi một cách im lặng, không báo lỗi gì, nên rất khó đoán ra nguyên nhân.
 */
export {};
