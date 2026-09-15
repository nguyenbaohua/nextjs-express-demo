/*
 * ============================================================================
 * PROXY — người gác cổng chạy TRƯỚC mọi trang
 * ============================================================================
 *
 * 📌 LƯU Ý VỀ TÊN FILE: từ Next.js 16, `middleware.ts` được đổi tên thành
 * `proxy.ts`. Chức năng y hệt, chỉ đổi tên cho sát với vai trò thật của nó. Nếu
 * bạn đọc tài liệu hay bài viết cũ thấy nhắc `middleware.ts`, đó chính là file
 * này. Dùng tên cũ vẫn chạy nhưng Next.js sẽ in cảnh báo deprecated.
 *
 * ⚠️ File này phải nằm ở `src/proxy.ts` — KHÔNG được nhét vào `features/` hay
 * `shared/`. Next.js tìm nó theo đúng đường dẫn đó (quy ước "file convention"),
 * để chỗ khác thì nó đơn giản là không bao giờ chạy, không có lỗi nào được báo.
 *
 * File này chạy trên server, TRƯỚC KHI bất kỳ trang nào được render. Nó có hai
 * nhiệm vụ:
 *
 *   1. CHẶN CỬA — chưa đăng nhập thì đá về /login; đã đăng nhập rồi mà còn vào
 *      /login thì đá về trang chủ.
 *
 *   2. TỰ ĐỘNG GIA HẠN TOKEN — access token hết hạn sau 1 giờ. Thay vì bắt người
 *      dùng đăng nhập lại, proxy lặng lẽ dùng refresh token xin cặp token mới.
 *      Người dùng không hề biết chuyện đó vừa xảy ra.
 *
 * ----------------------------------------------------------------------------
 * ⚠️ ĐIỀU QUAN TRỌNG NHẤT PHẢI HIỂU VỀ FILE NÀY
 * ----------------------------------------------------------------------------
 *
 * PROXY KHÔNG PHẢI LÀ LỚP BẢO MẬT THẬT. Nó là lớp TRẢI NGHIỆM.
 *
 * Nó chỉ nhìn xem cookie có tồn tại hay không — nó KHÔNG kiểm chữ ký token, và
 * cố ý không làm vậy (nó không có `JWT_SECRET`, và cũng không nên có). Ai đó
 * hoàn toàn có thể tự tạo một cookie tên `access_token` với nội dung "abc" và
 * qua mặt được proxy.
 *
 * Nhưng qua được proxy thì cũng chẳng làm gì được. Vì lớp bảo vệ THẬT nằm ở
 * `backend/src/middlewares/requireAuth.ts`: Express kiểm chữ ký JWT trên từng
 * request API, và câu query trong `todo.service.ts` luôn kèm điều kiện `userId`.
 * Cookie giả sẽ bị Express trả về 401 ngay lập tức.
 *
 * Bạn tự kiểm chứng được:
 *
 *     curl -H 'Cookie: access_token=toi-tu-bia-ra' http://localhost:3001/
 *
 * Proxy cho qua (HTTP 200), rồi trang hiện hộp lỗi "Phiên đăng nhập không hợp lệ
 * hoặc đã hết hạn" — câu đó đến từ `requireAuth` bên Express.
 *
 * Vậy proxy để làm gì? Để người dùng chưa đăng nhập nhìn thấy trang đăng nhập
 * thay vì một trang trắng đầy lỗi. Đó là việc của trải nghiệm, không phải bảo mật.
 *
 * Chính tài liệu Next.js cũng nhấn mạnh điều này: proxy chỉ nên làm "optimistic
 * check" (kiểm tra lạc quan) bằng cách đọc cookie, còn kiểm tra thật thì phải đặt
 * càng SÁT NGUỒN DỮ LIỆU càng tốt. Ở dự án này, "sát nguồn dữ liệu" nghĩa là ở
 * Express, ngay cạnh database.
 *
 * Nguyên tắc chung đáng nhớ: MỌI THỨ CHẠY Ở PHÍA NGƯỜI DÙNG ĐỀU CÓ THỂ BỊ GIẢ
 * MẠO. Chỉ những gì server tự kiểm chứng mới đáng tin.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  COOKIE,
  DEFAULT_API_BASE_URL,
  PUBLIC_ROUTES,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
  ROUTES,
  TOKEN_EXPIRY_SAFETY_MARGIN_SECONDS,
} from "@/shared/config/constants";

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);
  const accessToken = request.cookies.get(COOKIE.accessToken)?.value;
  const refreshToken = request.cookies.get(COOKIE.refreshToken)?.value;

  /*
   * --------------------------------------------------------------------------
   * TRƯỜNG HỢP 1 — Còn access token, tức là đang đăng nhập bình thường
   * --------------------------------------------------------------------------
   *
   * Nhớ lại mẹo trong `shared/lib/session.ts`: hạn của cookie access token được
   * đặt bằng đúng hạn của token (trừ hao một phút). Nên "cookie còn tồn tại"
   * đồng nghĩa với "token còn sống" — không cần đọc đồng hồ, không cần giải mã
   * token, không cần gọi ai.
   *
   * Đây là nhánh chạy cho khoảng 99,9% số request. Nó phải thật nhanh, và nó
   * nhanh vì chẳng làm gì cả ngoài đọc một cookie.
   */
  if (accessToken) {
    /*
     * Đã đăng nhập rồi mà còn mở /login hay /register thì đưa thẳng về trang chủ.
     * Chi tiết nhỏ nhưng thiếu nó là thấy khó chịu ngay: người dùng bấm nút Back
     * sau khi đăng nhập sẽ rơi lại vào form đăng nhập trống trơn và tưởng mình
     * vừa bị đăng xuất.
     */
    if (isPublicRoute) {
      return NextResponse.redirect(new URL(ROUTES.home, request.url));
    }
    return NextResponse.next();
  }

  /*
   * --------------------------------------------------------------------------
   * TRƯỜNG HỢP 2 — Hết access token nhưng còn refresh token → gia hạn
   * --------------------------------------------------------------------------
   *
   * Đây là phần đáng giá nhất của file, và cũng là phần khiến người dùng có cảm
   * giác "đăng nhập một lần là xong".
   *
   * Vì sao việc gia hạn phải nằm ở ĐÂY mà không nằm trong `shared/api/http.ts`?
   *
   *   Vì gia hạn xong thì phải LƯU cặp token mới vào cookie, mà Next.js chỉ cho
   *   ghi cookie ở ba nơi: Server Action, Route Handler, và proxy. `http.ts` chủ
   *   yếu được gọi từ Server Component — nơi không ghi cookie được (lý do vật lý
   *   đã giải thích trong `features/auth/actions.ts`). Nếu đặt ở đó, mỗi request
   *   sẽ phải gia hạn lại từ đầu vì không có chỗ nào cất kết quả.
   *
   * Về hiệu năng: proxy chạy trên MỌI request, nên gọi mạng ở đây nghe có vẻ
   * đáng lo. Nhưng để ý điều kiện — đoạn này chỉ chạy khi cookie access token đã
   * biến mất, tức là mỗi giờ một lần cho mỗi người dùng.
   */
  if (refreshToken) {
    try {
      /*
       * Gọi thẳng backend bằng `fetch` thay vì dùng `features/auth/api.ts`.
       *
       * Lý do: `api.ts` gọi xuống `shared/api/http.ts`, file đó dùng
       * `shared/lib/session.ts`, mà `session.ts` dùng `cookies()` của
       * `next/headers` — thứ CHỈ dùng được trong Server Component / Server
       * Action, không dùng được trong proxy. Trong proxy, cookie được truy cập
       * qua `request.cookies` với API khác hẳn.
       *
       * Nên ở đây ta chấp nhận lặp lại một chút phần dựng URL và đọc phong bì.
       * Ép dùng chung một hàm cho hai môi trường khác nhau sẽ tạo ra một lớp
       * trừu tượng gượng gạo, rắc rối hơn chính đoạn code mà nó định tiết kiệm.
       *
       * Đây là một bài học đáng nhớ về việc "đừng lặp code": trùng lặp CÓ CHỦ Ý
       * giữa hai môi trường khác nhau thường rẻ hơn một lớp trừu tượng cố gắng
       * phục vụ cả hai.
       */
      const baseUrl = process.env.API_BASE_URL ?? DEFAULT_API_BASE_URL;
      const res = await fetch(`${baseUrl}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
        cache: "no-store",
      });

      if (res.ok) {
        const body = (await res.json()) as {
          success: boolean;
          data: {
            accessToken: string;
            refreshToken: string;
            expiresIn: number;
            user: { id: string; email: string };
          };
        };

        if (body.success) {
          const session = body.data;

          /*
           * ⚠️ PHẦN DỄ VIẾT SAI NHẤT CỦA CẢ FILE — đọc kỹ chỗ này.
           *
           * Hai nhóm lệnh `set` dưới đây trông giống nhau nhưng làm hai việc
           * KHÁC HẲN, và thiếu một trong hai là sinh bug:
           *
           *   `request.cookies.set(...)` — sửa cookie trên REQUEST ĐANG ĐI VÀO.
           *   Nhờ nó, Server Component sắp render ngay sau đây đọc được token
           *   MỚI. Không có dòng này, trang vẫn dùng token cũ đã hết hạn → gọi
           *   API nhận 401 → người dùng thấy lỗi dù ta vừa gia hạn thành công.
           *
           *   `response.cookies.set(...)` — gắn header `Set-Cookie` vào RESPONSE
           *   ĐI RA. Nhờ nó, trình duyệt lưu token mới cho những lần sau. Không
           *   có dòng này thì mỗi request đều phải gia hạn lại từ đầu.
           *
           * Một cái sửa HIỆN TẠI, một cái sửa TƯƠNG LAI. Cần cả hai.
           */
          request.cookies.set(COOKIE.accessToken, session.accessToken);

          const response = isPublicRoute
            ? NextResponse.redirect(new URL(ROUTES.home, request.url))
            : /*
               * `{ request: { headers: request.headers } }` là cách chuyển tiếp
               * request ĐÃ SỬA sang tầng render. Bỏ phần này đi thì dòng
               * `request.cookies.set` phía trên thành vô nghĩa, vì Next.js vẫn
               * dùng bản request gốc.
               *
               * Chú ý: KHÔNG viết `NextResponse.next({ headers })` — cú pháp đó
               * gửi header về cho TRÌNH DUYỆT, một chuyện hoàn toàn khác và có
               * thể làm hỏng Server Actions.
               */
              NextResponse.next({ request: { headers: request.headers } });

          const cookieOptions = {
            httpOnly: true,
            sameSite: "lax" as const,
            secure: process.env.NODE_ENV === "production",
            path: "/",
          };

          response.cookies.set(COOKIE.accessToken, session.accessToken, {
            ...cookieOptions,
            maxAge: Math.max(session.expiresIn - TOKEN_EXPIRY_SAFETY_MARGIN_SECONDS, 1),
          });

          /*
           * ⚠️ BẮT BUỘC phải ghi đè refresh token, và đây là chỗ rất dễ quên.
           *
           * Backend XOAY VÒNG refresh token: mỗi lần gia hạn, hàng cũ trong bảng
           * `Session` bị xoá và một token mới được cấp (xem `auth.service.ts`).
           * Nghĩa là chuỗi cũ trong cookie ĐÃ CHẾT ngay khi request này thành công.
           *
           * Quên dòng này thì hiện tượng rất khó hiểu: mọi thứ chạy tốt trong một
           * giờ đầu, rồi lần gia hạn THỨ HAI thất bại và người dùng bị đá ra.
           * Một bug chỉ xuất hiện sau hai tiếng đồng hồ — đúng loại bug không bao
           * giờ bị phát hiện lúc bạn ngồi test bằng tay.
           *
           * Nhân tiện: cũng phải ghi đè cookie `user`, vì nó sống 30 ngày tính từ
           * lúc ghi. Không gia hạn nó thì nó chết trước refresh token mới.
           */
          response.cookies.set(COOKIE.refreshToken, session.refreshToken, {
            ...cookieOptions,
            maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
          });

          response.cookies.set(COOKIE.user, JSON.stringify(session.user), {
            ...cookieOptions,
            maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
          });

          return response;
        }
      }
    } catch {
      /*
       * Gia hạn thất bại — có thể refresh token đã hết hạn 30 ngày, đã bị thu
       * hồi vì người dùng bấm đăng xuất ở thiết bị khác, hoặc đơn giản là backend
       * đang không chạy.
       *
       * Ta nuốt lỗi và để chương trình rơi xuống TRƯỜNG HỢP 3 (đá về trang đăng
       * nhập). Đây là một trong số ít chỗ mà nuốt lỗi im lặng là ĐÚNG: người dùng
       * chẳng làm được gì với thông báo "refresh token expired" cả, thứ họ cần là
       * một form đăng nhập.
       */
    }
  }

  /*
   * --------------------------------------------------------------------------
   * TRƯỜNG HỢP 3 — Không có gì cả, hoặc gia hạn thất bại
   * --------------------------------------------------------------------------
   */
  if (isPublicRoute) {
    // Chưa đăng nhập mà vào /login — đúng chỗ rồi, cứ để đi tiếp.
    return NextResponse.next();
  }

  /*
   * Đá về trang đăng nhập, kèm `?next=` ghi lại nơi người dùng ĐỊNH tới.
   *
   * Nhờ vậy, ai bấm vào link "/todos/5" từ email lúc chưa đăng nhập sẽ được đưa
   * đúng tới todo đó sau khi đăng nhập xong, thay vì bị bỏ ở trang chủ và phải tự
   * mò lại.
   *
   * ⚠️ Tham số `next` này là dữ liệu ĐẾN TỪ NGƯỜI DÙNG, nên khi đọc nó ra để
   * chuyển hướng phải kiểm tra kỹ — nếu không sẽ dính lỗ hổng "open redirect".
   * Phần kiểm tra đó nằm ở `features/auth/actions.ts`, hàm `safeRedirectPath`.
   *
   * (Ở đây thì giá trị là `pathname` do chính Next.js cung cấp nên luôn an toàn.
   * Nhưng người dùng có thể tự gõ `?next=` bất kỳ vào URL trang đăng nhập, nên
   * điểm kiểm tra bắt buộc phải nằm ở chỗ ĐỌC, không phải ở chỗ GHI.)
   */
  const loginUrl = new URL(ROUTES.login, request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

/*
 * ----------------------------------------------------------------------------
 * MATCHER — proxy chạy ở những đường dẫn nào
 * ----------------------------------------------------------------------------
 *
 * Biểu thức chính quy này đọc là: "chạy trên MỌI đường dẫn, TRỪ những cái khớp
 * các mẫu liệt kê bên trong".
 *
 * `(?!...)` gọi là "negative lookahead" — khẳng định rằng vị trí này KHÔNG được
 * bắt đầu bằng những chuỗi đó.
 *
 * Vì sao phải loại trừ?
 *   `_next/static`, `_next/image` — file JS/CSS/ảnh do Next.js sinh ra. Chạy
 *   proxy trên chúng là lãng phí: mỗi trang tải hàng chục file như vậy, và mỗi
 *   lần chạy proxy là một lần đọc cookie vô ích.
 *
 *   `favicon.ico`, các file ảnh — tương tự, đây là tài nguyên tĩnh, chẳng có gì
 *   để bảo vệ.
 *
 * Với phần đăng nhập, tài liệu Next.js khuyên nên để proxy chạy trên TẤT CẢ các
 * trang (chỉ loại trừ tài nguyên tĩnh) — đúng như cấu hình dưới đây.
 *
 * Lý do lại là bài học cũ, và nó lặp lại xuyên suốt dự án này: liệt kê "những
 * trang CẦN bảo vệ" thì sẽ có ngày quên một trang, và quên kiểu đó thì không ai
 * phát hiện ra cho tới khi dữ liệu đã lộ. Chặn tất cả rồi mở ra vài ngoại lệ thì
 * quên sót nghĩa là một trang công khai bị khoá nhầm — người dùng báo ngay trong
 * ngày.
 *
 * Luôn chọn kiểu sai sót ồn ào.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
