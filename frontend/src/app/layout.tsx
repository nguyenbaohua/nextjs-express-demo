/*
 * ============================================================================
 * ROOT LAYOUT — khung bao ngoài của MỌI trang
 * ============================================================================
 *
 * ---------------------------------------------------------------------------
 * "FILE CONVENTION" — quy tắc quan trọng nhất của Next.js App Router
 * ---------------------------------------------------------------------------
 *
 * Trong Next.js, TÊN FILE quyết định chức năng. Bạn không khai báo route ở đâu
 * cả — chỉ cần đặt file đúng tên vào đúng thư mục.
 *
 * Các tên file có ý nghĩa đặc biệt trong thư mục `app/`:
 *
 *   layout.tsx     → khung bao quanh, dùng chung cho các trang bên trong
 *   page.tsx       → nội dung của một trang (tạo ra một URL)
 *   loading.tsx    → giao diện hiện tạm trong lúc trang đang tải
 *   not-found.tsx  → giao diện khi gọi notFound()
 *   error.tsx      → giao diện khi có lỗi (dự án này chưa dùng)
 *
 * File này tên `layout.tsx` và nằm ngay tại gốc `app/`, nên nó là ROOT LAYOUT.
 * Next.js BẮT BUỘC phải có nó, và nó BẮT BUỘC phải chứa thẻ <html> và <body> —
 * vì trong Next.js không có file index.html nào cả, HTML gốc sinh ra từ đây.
 *
 * ---------------------------------------------------------------------------
 * ĐIỂM HAY CỦA LAYOUT
 * ---------------------------------------------------------------------------
 * Khi bạn chuyển từ trang danh sách sang trang chi tiết, layout KHÔNG render
 * lại. Nó giữ nguyên trạng thái, giữ nguyên vị trí cuộn. Chỉ phần `children`
 * được thay. Nhờ vậy chuyển trang mượt như app một trang (SPA).
 *
 * Nếu bạn thêm một `layout.tsx` vào `app/todos/`, nó sẽ lồng bên trong layout
 * này — layout gốc bọc layout con, layout con bọc trang.
 */

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

/*
 * ---------------------------------------------------------------------------
 * FONT — `next/font` làm gì cho bạn
 * ---------------------------------------------------------------------------
 *
 * Cách thông thường để dùng Google Fonts là chèn một thẻ <link> trỏ tới
 * fonts.googleapis.com. Cách đó có hai vấn đề: trình duyệt phải tải font từ
 * server của Google (chậm hơn, và lộ IP người dùng cho bên thứ ba), và chữ hay
 * bị "nhảy" khi font tải xong.
 *
 * `next/font/google` TẢI FONT VỀ LÚC BUILD và phục vụ từ chính server của bạn.
 * Không có request nào tới Google lúc chạy. Next.js cũng tự tính toán để chữ
 * không bị nhảy.
 *
 * `variable: "--font-geist-sans"` tạo ra một biến CSS. Nhờ nó mà trong
 * globals.css ta viết được `font-family: var(--font-geist-sans)`.
 *
 * `subsets` chọn bộ ký tự cần tải. Có "vietnamese" để hiển thị đúng dấu tiếng
 * Việt — thiếu nó thì chữ "ế", "ữ" sẽ bị thay bằng font dự phòng, trông lệch lạc.
 */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "vietnamese"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "vietnamese"],
});

/*
 * ---------------------------------------------------------------------------
 * METADATA — thẻ <title> và <meta> mà không cần đụng vào <head>
 * ---------------------------------------------------------------------------
 *
 * Bạn export một object tên `metadata`, Next.js tự sinh các thẻ tương ứng trong
 * <head>. Không cần thư viện như react-helmet.
 *
 * Mỗi `page.tsx` cũng có thể export `metadata` riêng để ghi đè cho trang đó.
 *
 * Icon của tab trình duyệt thì không khai ở đây: Next.js tự nhận file
 * `app/icon.svg` theo file convention — cứ đặt file đúng tên là xong.
 */
export const metadata: Metadata = {
  title: "Todo List",
  description: "Quản lý công việc hằng ngày",
};

/**
 * `LayoutProps<"/">` là kiểu do Next.js TỰ SINH RA khi bạn chạy `next dev` hoặc
 * `next build`. Nó biết layout này ở route "/" và tự suy ra `children` cùng các
 * tham số động (nếu có). Đó là lý do bạn không thấy dòng `import` nào cho nó —
 * kiểu này là biến toàn cục.
 *
 * Component này không có "use client" nên nó là SERVER COMPONENT (mặc định của
 * Next.js). Xem giải thích đầy đủ ở app/page.tsx.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    /*
     * `lang="vi"` giúp trình đọc màn hình phát âm đúng tiếng Việt, và giúp trình
     * duyệt gợi ý dịch trang chính xác.
     *
     * Hai biến font được gắn vào <html> để mọi phần tử con đều dùng được.
     */
    <html lang="vi" className={`${geistSans.variable} ${geistMono.variable}`}>
      {/* `children` là nơi Next.js đặt nội dung trang đang được xem. */}
      <body>{children}</body>
    </html>
  );
}
