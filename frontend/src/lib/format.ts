/*
 * ============================================================================
 * ĐỊNH DẠNG NGÀY GIỜ
 * ============================================================================
 */

/*
 * `Intl.DateTimeFormat` là API có sẵn của JavaScript, không phải thư viện ngoài.
 * Nó biết cách trình bày ngày giờ theo từng quốc gia: "vi-VN" cho ra
 * "13:43 21/08/2026", còn "en-US" sẽ cho ra "08/21/2026, 1:43 PM".
 *
 * Tạo formatter Ở NGOÀI hàm (module scope) là cố ý: khởi tạo một formatter khá
 * tốn kém, nên tạo một lần rồi dùng lại cho mọi lần gọi, thay vì tạo mới mỗi lần.
 */
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Đổi chuỗi ISO từ backend ("2026-08-21T13:43:21.648Z") thành chuỗi dễ đọc.
 *
 * MỘT CÁI BẪY CỦA NEXT.JS cần biết:
 *
 * Code Next.js chạy ở HAI nơi — trên server (Node.js) và trên trình duyệt. Nếu
 * cùng một hàm format ngày chạy ở hai nơi mà cho ra kết quả KHÁC NHAU (vì server
 * ở múi giờ UTC còn máy bạn ở UTC+7), React sẽ báo lỗi "hydration mismatch":
 * HTML server gửi xuống không khớp với thứ trình duyệt tự dựng lại.
 *
 * Ở đây an toàn vì hàm này chỉ được gọi trong Server Component
 * (app/todos/[id]/page.tsx). Server Component render MỘT LẦN trên server và
 * không bao giờ render lại ở trình duyệt, nên không có gì để lệch.
 *
 * Nếu sau này bạn cần format ngày trong Client Component, hãy nhớ cái bẫy này.
 */
export function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}
