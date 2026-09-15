/*
 * ============================================================================
 * AppError — lớp lỗi riêng, mang theo mã HTTP status
 * ============================================================================
 *
 * ---------------------------------------------------------------------------
 * VẤN ĐỀ CẦN GIẢI QUYẾT
 * ---------------------------------------------------------------------------
 * Tầng service là nơi HIỂU RÕ NHẤT chuyện gì vừa xảy ra ("không có todo id 7"),
 * nhưng nó lại KHÔNG ĐƯỢC PHÉP biết gì về HTTP — không có `res`, không được trả
 * về mã 404 (xem lý do phân tầng ở đầu file `services/todo.service.ts`).
 *
 * Ngược lại, `errorHandler` biết cách trả lời HTTP nhưng lại không biết gì về
 * nghiệp vụ: nó chỉ nhận được một cục lỗi và phải tự đoán nên trả mã nào.
 *
 * `AppError` chính là cầu nối. Service ném ra một lỗi có gắn sẵn con số:
 *
 *     throw new AppError(404, "Không tìm thấy todo với id 7");
 *
 * và `errorHandler` chỉ việc lấy con số đó ra dùng. Service vẫn không cần import
 * gì của Express — nó chỉ đang nói "mức độ nghiêm trọng của chuyện này là 404",
 * chứ không tự tay gửi phản hồi.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO KHÔNG DÙNG `new Error("...")` THÔNG THƯỜNG?
 * ---------------------------------------------------------------------------
 * Vì `Error` chỉ có `message` — một chuỗi văn bản. Muốn phân biệt "lỗi 404 bình
 * thường" với "lỗi 500 nghiêm trọng", bạn sẽ phải làm những trò rất mong manh
 * như đọc nội dung chuỗi: `if (err.message.includes("không tìm thấy"))`. Chỉ cần
 * ai đó sửa lại lời văn là code hỏng.
 *
 * Tạo một LỚP riêng cho phép phân biệt bằng `instanceof` — dựa vào KIỂU của đối
 * tượng chứ không dựa vào nội dung chữ. Cách này không bao giờ hỏng vì đổi câu
 * chữ, và TypeScript còn hiểu được: sau `if (err instanceof AppError)`, nó biết
 * chắc `err.statusCode` tồn tại và là số.
 */

/*
 * `extends Error` — kế thừa lớp lỗi có sẵn của JavaScript.
 *
 * Kế thừa để giữ lại mọi thứ `Error` đã làm tốt: thuộc tính `message`, `name`,
 * và quan trọng nhất là `stack` — vết chân ghi lại lỗi phát sinh ở dòng nào,
 * file nào. Ta chỉ THÊM một thứ mới là `statusCode`.
 */
export class AppError extends Error {
  /*
   * Khai báo thuộc tính mới. Đây là phần "giá trị gia tăng" của lớp này so với
   * `Error` gốc: một con số mã HTTP status.
   */
  statusCode: number;

  constructor(statusCode: number, message: string) {
    /*
     * `super(message)` gọi hàm khởi tạo của lớp cha (`Error`) để nó thiết lập
     * `this.message` và ghi lại stack trace.
     *
     * Trong JavaScript, dòng này BẮT BUỘC phải đứng trước mọi câu lệnh đụng tới
     * `this`. Chưa gọi `super()` thì `this` chưa tồn tại — đây là luật của ngôn
     * ngữ, không phải quy ước.
     */
    super(message);

    this.statusCode = statusCode;

    /*
     * Dòng này trông rất khó hiểu, và nó tồn tại vì một lý do lịch sử cụ thể.
     *
     * VẤN ĐỀ: khi TypeScript biên dịch sang chuẩn ES5 (để chạy được trên trình
     * duyệt cũ), nó phải giả lập `class` bằng function — mà cách giả lập đó làm
     * ĐỨT chuỗi prototype đối với các lớp có sẵn của JavaScript như `Error`,
     * `Array`, `Map`. Hậu quả:
     *
     *     const err = new AppError(404, "...");
     *     err instanceof AppError   // → false (!!!)  dù nó đúng là AppError
     *
     * Mà toàn bộ `errorHandler` của chúng ta dựa vào `instanceof`. Nếu nó trả về
     * `false`, mọi lỗi 404 sẽ rơi xuống nhánh cuối và biến thành 500 — sai hoàn
     * toàn, lại còn cực khó tìm ra nguyên nhân.
     *
     * `Object.setPrototypeOf(this, AppError.prototype)` nối lại sợi dây bị đứt
     * đó bằng tay, ngay sau khi đối tượng được tạo.
     *
     * Dự án này biên dịch sang ES2022 (xem `target` trong `tsconfig.json`) nên
     * thực ra không dính lỗi trên. Dòng này giữ lại như một tấm bảo hiểm rẻ tiền:
     * nếu mai có ai hạ `target` xuống, code vẫn chạy đúng. Bạn sẽ gặp lại dòng
     * này trong rất nhiều dự án TypeScript, giờ thì bạn biết nó để làm gì.
     */
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
