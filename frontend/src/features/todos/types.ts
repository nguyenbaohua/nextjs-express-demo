/*
 * ============================================================================
 * KIỂU DỮ LIỆU CỦA NGHIỆP VỤ TODO
 * ============================================================================
 *
 * File này nằm trong `features/todos/` chứ không ở `shared/types/`, và ranh giới
 * đó có ý nghĩa thật: chỉ code của nghiệp vụ todo mới cần biết một `Todo` trông
 * như thế nào. Nghiệp vụ auth không cần, và sẽ không bao giờ import file này.
 *
 * Cách tự kiểm tra xem một kiểu nên nằm đâu: thử tưởng tượng xoá cả thư mục
 * `features/todos/` đi. Kiểu nào không còn ai dùng thì nó thuộc về đây.
 */

/**
 * Một todo, đúng như backend Express trả về.
 *
 * Lưu ý `createdAt` và `updatedAt` là `string` chứ không phải `Date`.
 *
 * Lý do: dữ liệu đi qua JSON, mà JSON KHÔNG CÓ kiểu ngày tháng. Prisma trả về
 * một đối tượng `Date`, rồi `res.json()` bên backend biến nó thành chuỗi ISO
 * ("2026-08-21T13:43:21.648Z"), và frontend nhận được đúng chuỗi đó.
 *
 * Đây là chỗ rất hay bị nhầm: khai `createdAt: Date` thì TypeScript sẽ vui vẻ
 * cho bạn gọi `todo.createdAt.getFullYear()`, và code nổ lúc chạy vì chuỗi
 * không có hàm đó. Kiểu dữ liệu phải mô tả SỰ THẬT LÚC CHẠY, không phải mô tả
 * điều bạn mong muốn.
 *
 * Muốn hiển thị đẹp thì tự parse — xem `shared/lib/format.ts`.
 */
export type Todo = {
  id: number;
  content: string;
  isDone: boolean;
  createdAt: string;
  updatedAt: string;
};
