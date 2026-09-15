/*
 * ============================================================================
 * TẦNG GỌI API — nơi duy nhất nói chuyện với backend Express
 * ============================================================================
 *
 * ĐIỀU QUAN TRỌNG NHẤT CẦN HIỂU VỀ FILE NÀY:
 *
 *     File này chỉ chạy TRÊN SERVER, không bao giờ chạy trong trình duyệt.
 *
 * Vì sao? Vì nó chỉ được import bởi Server Component (`page.tsx`) và Server
 * Action (các file `actions.ts` trong `features/`) — cả hai đều là code phía
 * server. Next.js phân tích cây import và chỉ gửi xuống trình duyệt những file
 * thực sự cần cho phía client.
 *
 * Hệ quả rất có lợi:
 *   1. `process.env.API_BASE_URL` đọc được ở đây. Nếu file này chạy ở trình
 *      duyệt thì không đọc được, vì Next.js chỉ lộ ra trình duyệt các biến có
 *      tiền tố `NEXT_PUBLIC_`. Ta cố tình KHÔNG dùng tiền tố đó để URL backend
 *      không lộ ra ngoài.
 *   2. Trình duyệt không bao giờ gọi thẳng Express. Luồng là:
 *         trình duyệt → server Next.js → Express → PostgreSQL
 *      Nhờ chặng giữa đó mà token cất được trong cookie `httpOnly`.
 *
 * ----------------------------------------------------------------------------
 * VÌ SAO FILE NÀY Ở `shared/` CHỨ KHÔNG Ở TRONG TỪNG FEATURE?
 * ----------------------------------------------------------------------------
 * Vì nó không biết gì về nghiệp vụ. Nó chỉ biết: gọi HTTP, bóc phong bì
 * `{ success, data }`, đổi lỗi thành `ApiError`. Cả `features/auth/api.ts` và
 * `features/todos/api.ts` đều dùng chung, và feature nào thêm sau này cũng vậy.
 *
 * Phân định cho rõ:
 *     shared/api/http.ts       — GỌI THẾ NÀO (giao thức, lỗi, token)
 *     features/todos/api.ts    — GỌI CÁI GÌ  (đường dẫn, tham số, kiểu trả về)
 */

import { getAccessToken } from "@/shared/lib/session";
import { DEFAULT_API_BASE_URL } from "@/shared/config/constants";
import type { ApiResponse } from "@/shared/types/api";

/*
 * Đọc cấu hình MỘT LẦN khi module được nạp, thay vì đọc lại mỗi request.
 *
 * `??` là toán tử "nullish coalescing": lấy vế trái, trừ khi vế trái là
 * `null`/`undefined` thì lấy vế phải. Ở đây nghĩa là: dùng biến môi trường,
 * chưa đặt thì dùng giá trị mặc định.
 *
 * Chú ý nó khác `||`: với `||`, một chuỗi rỗng `""` cũng bị coi là "không có" và
 * rơi sang vế phải. Với `??` thì chuỗi rỗng vẫn được dùng. Ở đây hai cách cho
 * kết quả như nhau, nhưng thói quen dùng `??` sẽ cứu bạn ở chỗ khác — nhất là
 * với số 0 và giá trị `false`, hai thứ hợp lệ mà `||` hay nuốt mất.
 *
 * Biến này đến từ file `.env.local` — Next.js tự động đọc file đó, bạn không cần
 * cài thêm thư viện như `dotenv`.
 */
const BASE_URL = process.env.API_BASE_URL ?? DEFAULT_API_BASE_URL;

/**
 * Lớp lỗi riêng, mang theo mã HTTP status.
 *
 * Vì sao cần? Vì `Error` thường chỉ có `message`, mà nơi gọi cần phân biệt được
 * "404 — không tìm thấy todo" với "500 — server sập". Trang chi tiết dựa vào
 * `err.status === 404` để hiện trang "không tìm thấy" thay vì màn hình lỗi
 * (xem `app/todos/[id]/page.tsx`).
 *
 * Phân biệt bằng KIỂU (`instanceof`) và bằng một con số, chứ không bằng cách đọc
 * nội dung chuỗi `message` — vì chuỗi thì ai sửa lời văn cũng làm hỏng code.
 */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/*
 * ----------------------------------------------------------------------------
 * HAI CỬA GỌI API: `request` VÀ `publicRequest`
 * ----------------------------------------------------------------------------
 *
 * Khác nhau đúng một điều: `request` đính kèm access token, `publicRequest` thì
 * không. Cả hai đều gọi xuống `send()` — nơi giữ toàn bộ phần xử lý lỗi.
 *
 * Vì sao tách đôi thay vì viết một hàm với tham số kiểu `needsAuth: boolean`?
 *
 *   Vì tách ra thì gọi nhầm trở nên KHÓ. `publicRequest` dùng cho đúng ba API mà
 *   người chưa đăng nhập bắt buộc phải gọi được: đăng ký, đăng nhập, gia hạn.
 *   Mọi thứ còn lại dùng `request`.
 *
 *   Với một hàm có cờ bật/tắt, giá trị mặc định của cờ sẽ âm thầm quyết định số
 *   phận của những dòng code viết vội sau này. Với hai tên hàm khác nhau, bạn
 *   BUỘC phải chọn — và người đọc code nhìn tên hàm là biết ngay API đó công
 *   khai hay cần đăng nhập.
 *
 * Nguyên tắc: khi một lựa chọn có hệ quả về bảo mật, hãy làm cho nó HIỆN RÕ chứ
 * đừng giấu nó sau một giá trị mặc định.
 */

/** Gọi API KHÔNG kèm token — chỉ dùng cho các API xác thực công khai. */
export async function publicRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return send<T>(path, init);
}

/** Gọi API CÓ kèm access token. Dùng cho mọi thứ còn lại. */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  /*
   * Đọc access token từ cookie httpOnly.
   *
   * Dòng này chỉ chạy được vì file này luôn thực thi trên SERVER Next.js (bên
   * trong Server Component hoặc Server Action) — đúng như phần đầu file đã nói.
   * Trình duyệt không bao giờ chạy hàm này, nên nó cũng không bao giờ thấy token.
   */
  const accessToken = await getAccessToken();

  if (!accessToken) {
    /*
     * Không có token thì dừng ngay, khỏi tốn một request vô ích ra backend chỉ để
     * nhận về 401.
     *
     * Bình thường không rơi vào đây, vì `proxy.ts` đã chặn người chưa đăng nhập
     * từ trước. Nhưng "bình thường không xảy ra" khác với "không bao giờ xảy ra":
     * cookie có thể vừa hết hạn đúng khoảnh khắc đó, hoặc bị xoá giữa chừng. Có
     * thêm một lớp kiểm tra ngay sát chỗ dùng thì lỗi cũng lỗi một cách rõ ràng.
     */
    throw new ApiError(401, "Bạn cần đăng nhập để thực hiện thao tác này.");
  }

  return send<T>(path, {
    ...init,
    /*
     * Đây là dòng làm nên toàn bộ tính năng "chỉ thấy ghi chú của chính mình".
     *
     * `Bearer` là tiền tố bắt buộc theo chuẩn RFC 6750: backend cắt bỏ đúng 7 ký
     * tự `"Bearer "` rồi mới kiểm phần còn lại. Viết thiếu chữ đó, hoặc thiếu dấu
     * cách, là bị từ chối ngay — và thông báo lỗi sẽ chỉ là 401 chung chung,
     * không hề gợi ý rằng bạn viết sai tiền tố.
     */
    headers: { Authorization: `Bearer ${accessToken}`, ...init?.headers },
  });
}

/*
 * ----------------------------------------------------------------------------
 * `send` — nơi mọi lời gọi cuối cùng đều đi qua
 * ----------------------------------------------------------------------------
 *
 * Nó làm ba việc, và mỗi việc đều có một cái bẫy riêng đáng biết.
 *
 * Về `cache: "no-store"` — khái niệm Next.js quan trọng nhất ở file này:
 *
 *   Next.js thay thế hàm `fetch` gốc bằng phiên bản riêng có thêm khả năng cache.
 *   Bạn vẫn viết `fetch(...)` như bình thường, nhưng nó có thêm tuỳ chọn.
 *
 *   `cache: "no-store"` nghĩa là: TUYỆT ĐỐI không lưu lại kết quả, mỗi lần gọi là
 *   một lần hỏi backend thật.
 *
 *   Vì sao cần với app todo? Vì dữ liệu thay đổi liên tục. Nếu Next.js cache lại,
 *   bạn thêm một task mới nhưng trang vẫn hiện danh sách cũ — trông như app hỏng.
 *
 *   Tác dụng phụ: khi một trang có `fetch` kiểu `no-store`, Next.js đánh dấu trang
 *   đó là "dynamic" — render lại ở mỗi request thay vì dựng sẵn HTML lúc build.
 *   Chạy `npm run build` bạn sẽ thấy dấu `ƒ` (Dynamic) bên cạnh `/` và
 *   `/todos/[id]`. Đó là bằng chứng nhìn thấy được của lựa chọn này.
 */
async function send<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;

  /*
   * try/catch thứ nhất: bắt lỗi TẦNG MẠNG.
   *
   * ⚠️ Cái bẫy lớn nhất của `fetch`, và nó làm người mới ngã rất nhiều lần:
   *
   *     `fetch` CHỈ ném lỗi khi KHÔNG KẾT NỐI ĐƯỢC.
   *
   * Backend trả về 404? 500? `fetch` coi là THÀNH CÔNG — nó kết nối được mà, và
   * nó đã nhận về một response hoàn chỉnh. Việc response đó mang tin xấu là
   * chuyện của tầng ứng dụng, không phải của tầng vận chuyển.
   *
   * Nghĩa là `await fetch(...)` không ném lỗi KHÔNG hề đảm bảo mọi thứ ổn. Phải
   * tự kiểm `res.ok` — đó là việc của khối phía dưới.
   */
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      cache: "no-store",
      // `...init?.headers` đặt SAU để lời gọi cụ thể có thể ghi đè header mặc định.
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(503, "Không kết nối được tới server. Kiểm tra backend đã chạy chưa.");
  }

  let body: ApiResponse<T> | null = null;

  /*
   * try/catch thứ hai: bắt lỗi PARSE JSON.
   *
   * Nếu backend sập giữa chừng và trả về một trang HTML lỗi thay vì JSON,
   * `res.json()` sẽ ném lỗi. Ta nuốt lỗi đó và để `body = null`, rồi xử lý thống
   * nhất ở dưới — như vậy nơi gọi luôn nhận được `ApiError` gọn gàng thay vì một
   * lỗi cú pháp JSON khó hiểu kiểu "Unexpected token < in JSON at position 0".
   *
   * (Nếu bạn từng thấy đúng thông báo đó: nó gần như luôn có nghĩa là server trả
   * về HTML — thường là một trang lỗi hoặc trang đăng nhập — chứ không phải JSON.
   * Dấu `<` chính là đầu thẻ `<!DOCTYPE html>`.)
   */
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    body = null;
  }

  /*
   * Kiểm tra hai lớp:
   *   - `!res.ok`        → mã HTTP không thuộc 2xx
   *   - `!body?.success` → backend tự báo thất bại trong phong bì
   *
   * Vì sao kiểm cả hai khi chúng gần như luôn đi cùng nhau? Vì "gần như" không
   * phải "luôn luôn". Một proxy hay tầng hạ tầng nào đó ở giữa có thể trả về 200
   * kèm nội dung lạ. Kiểm cả hai thì không có khe hở nào.
   *
   * Backend đã viết message tiếng Việt sẵn (lỗi validate của zod, lỗi 401 của
   * requireAuth), nên ta dùng lại luôn thay vì tự chế thông báo mới — một nguồn
   * sự thật cho câu chữ, khỏi phải đồng bộ hai bên.
   */
  if (!res.ok || !body?.success) {
    const message = body && !body.success ? body.message : "Đã có lỗi xảy ra";
    throw new ApiError(res.status, message);
  }

  // Tới đây TypeScript đã biết chắc `body.success === true`, nên `body.data` hợp lệ.
  return body.data;
}
