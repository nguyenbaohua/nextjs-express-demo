/*
 * ============================================================================
 * KIỂU DỮ LIỆU CỦA NGHIỆP VỤ XÁC THỰC
 * ============================================================================
 *
 * File này chỉ còn một kiểu, vì `AuthSession` và `SessionUser` đã phải chuyển
 * sang `shared/lib/session.ts`.
 *
 * Vì sao chúng phải nằm ở đó? Vì `shared/` không được import từ `features/`
 * (xem luật chiều phụ thuộc trong `shared/config/constants.ts`), mà
 * `session.ts` thì cần đúng hai kiểu đó để khai chữ ký hàm `saveSession`.
 *
 * Đây là một đánh đổi rất thật của cách tổ chức theo feature, và đáng nhìn
 * thẳng vào nó: đôi khi một mẩu kiến thức bị kéo ra khỏi feature "tự nhiên" của
 * nó, chỉ vì tầng hạ tầng cần tới. Hai cách xử lý:
 *
 *   1. Chuyển kiểu đó lên `shared/` — cách ta chọn. Giữ được chiều phụ thuộc
 *      sạch sẽ, đổi lại `features/auth/types.ts` mỏng đi trông thấy.
 *
 *   2. Cho `shared/api/http.ts` nhận token qua tham số, để nó không cần biết gì
 *      về session. Sạch hơn về lý thuyết, nhưng mọi lời gọi API đều phải tự đi
 *      lấy token và truyền vào — lặp lại ở khắp nơi, và chỉ cần một chỗ quên là
 *      có một request không kèm token.
 *
 * Ta chọn (1) vì nó làm việc đúng trở thành việc dễ. Cấu trúc thư mục là công
 * cụ phục vụ bạn, không phải luật để tuân thủ bằng mọi giá.
 */

/**
 * Trạng thái trả về từ các form đăng nhập / đăng ký.
 *
 * Khác `FormState` của todo (`shared/types/api.ts`) ở chỗ có thêm nhánh thành
 * công kèm lời nhắn, để form báo được tin vui chứ không chỉ báo lỗi.
 *
 * ---------------------------------------------------------------------------
 * VỀ CÚ PHÁP `error?: never` — trông lạ nhưng rất đáng học
 * ---------------------------------------------------------------------------
 *
 * `never` là kiểu "không có giá trị nào thuộc về nó". Nên `error?: never` đọc
 * là: "trường `error` hoặc vắng mặt, hoặc `undefined` — không bao giờ có giá trị
 * thật".
 *
 * Nó tồn tại để chặn một trạng thái vô nghĩa: vừa thành công VỪA có lỗi.
 *
 *     const x: AuthFormState = { success: true, message: "ok", error: "hỏng" };
 *     //                                                       ^^^^^ lỗi biên dịch
 *
 * Không có `?: never`, TypeScript sẽ cho qua vì object đó khớp với nhánh thành
 * công và chỉ "thừa" một trường. Với `?: never`, nó bị chặn ngay lúc gõ.
 *
 * Đây lại chính là nguyên tắc đã nói ở `shared/types/api.ts`: làm cho trạng thái
 * sai trở thành thứ KHÔNG BIỂU DIỄN ĐƯỢC, thay vì viết code kiểm tra nó.
 */
export type AuthFormState =
  | { error: string; success?: never; message?: never }
  | { success: true; message: string; error?: never }
  | null;
