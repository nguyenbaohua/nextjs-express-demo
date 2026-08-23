# Học Next.js qua chính dự án này

Tài liệu này giải thích **bức tranh lớn** — những thứ khó nhét vừa vào comment trong code. Đọc file này trước, rồi mở code đọc comment sẽ dễ hiểu hơn nhiều.

---

## 1. Vấn đề Next.js sinh ra để giải quyết

### Cách làm React truyền thống (SPA)

```mermaid
sequenceDiagram
    participant U as Người dùng
    participant B as Trình duyệt
    participant S as Server
    participant A as API

    U->>B: Mở trang
    B->>S: Xin trang
    S-->>B: HTML TRỐNG + thẻ script
    Note over U,B: Màn hình trắng
    B->>S: Tải file JavaScript (thường vài trăm KB)
    Note over U,B: Vẫn trắng
    B->>A: Giờ mới gọi API lấy dữ liệu
    A-->>B: Dữ liệu JSON
    Note over U,B: Cuối cùng mới thấy nội dung
```

Ba lần chờ nối tiếp nhau. Người dùng nhìn màn hình trắng khá lâu, và bot tìm kiếm nhận về một trang rỗng.

### Cách của Next.js (Server Component)

```mermaid
sequenceDiagram
    participant U as Người dùng
    participant B as Trình duyệt
    participant S as Server Next.js
    participant A as API Express

    U->>B: Mở trang
    B->>S: Xin trang
    S->>A: Server tự gọi API
    A-->>S: Dữ liệu JSON
    S-->>B: HTML ĐÃ CÓ SẴN NỘI DUNG
    Note over U,B: Thấy nội dung ngay
    B->>S: Tải JS (chỉ phần cần tương tác)
    Note over U,B: Nút bấm bắt đầu hoạt động
```

Nội dung hiện ra ngay từ lần phản hồi đầu tiên. JavaScript tải sau chỉ để "gắn điện" cho các nút bấm.

---

## 2. Server Component và Client Component

Đây là khái niệm **quan trọng nhất**. Nếu chỉ nhớ một thứ từ tài liệu này, hãy nhớ phần này.

| | Server Component | Client Component |
|---|---|---|
| Đánh dấu bằng | *(mặc định, không cần gì)* | `"use client"` ở đầu file |
| Chạy ở đâu | Chỉ trên server | Server (dựng HTML) **rồi** trình duyệt |
| Được `async` / `await` | Có | Không |
| Gọi database / API bí mật | Có | Không |
| `useState`, `useEffect` | **Không** | Có |
| `onClick`, `onChange` | **Không** | Có |
| `window`, `localStorage` | **Không** | Có |
| Gửi JS xuống trình duyệt | Không byte nào | Có |

### Trong dự án này

```mermaid
graph TD
    L["layout.tsx<br/><b>SERVER</b>"] --> P["page.tsx<br/><b>SERVER</b><br/>gọi getTodos()"]
    P --> AF["AddTodoForm<br/><b>CLIENT</b><br/>cần useActionState"]
    P --> TI["TodoItem<br/><b>CLIENT</b><br/>cần onChange, onClick"]
    L --> D["todos/[id]/page.tsx<br/><b>SERVER</b><br/>gọi getTodoById()"]
    D --> EF["EditTodoForm<br/><b>CLIENT</b><br/>cần useState"]
    D --> DA["TodoDetailActions<br/><b>CLIENT</b><br/>cần useRouter"]

    style P fill:#2f6bff,color:#fff
    style D fill:#2f6bff,color:#fff
    style L fill:#2f6bff,color:#fff
    style AF fill:#d97706,color:#fff
    style TI fill:#d97706,color:#fff
    style EF fill:#d97706,color:#fff
    style DA fill:#d97706,color:#fff
```

Để ý: **hai trang đều là Server Component**. Chỉ những mảnh nhỏ cần tương tác mới là Client. Đó là cách dùng đúng — càng ít màu cam càng tốt.

### Quy tắc chiều lồng nhau

- Server Component **được** render Client Component bên trong. ✅
- Client Component **không** import được Server Component. ❌

Lý do: khi Next.js gửi Client Component xuống trình duyệt, mọi thứ nó import cũng phải đi cùng — mà Server Component thì không thể chạy ở trình duyệt.

### Hiểu lầm thường gặp

> "use client" nghĩa là component chỉ chạy ở trình duyệt.

**Sai.** Nó vẫn được render trên server để tạo HTML ban đầu. `"use client"` chỉ đánh dấu **ranh giới**: từ đây trở xuống, code cũng được gửi xuống trình duyệt.

---

## 3. Tên file quyết định chức năng

Next.js không có file cấu hình route. **Cấu trúc thư mục chính là route.**

```
src/app/
├── layout.tsx              khung bao ngoài MỌI trang (bắt buộc phải có)
├── page.tsx                →  URL "/"
├── loading.tsx             giao diện chờ cho "/"
├── icon.svg                icon trên tab trình duyệt (tự nhận, không cần khai báo)
├── globals.css
└── todos/
    └── [id]/               ngoặc vuông = khớp mọi giá trị
        ├── page.tsx        →  URL "/todos/1", "/todos/2", ...
        ├── loading.tsx     giao diện chờ cho trang chi tiết
        └── not-found.tsx   giao diện khi gọi notFound()
```

| Tên file | Vai trò |
|---|---|
| `page.tsx` | Tạo ra một URL xem được |
| `layout.tsx` | Khung bao quanh, **không** render lại khi chuyển trang |
| `loading.tsx` | Hiện tạm trong lúc `page.tsx` đang chờ dữ liệu |
| `not-found.tsx` | Hiện khi code gọi `notFound()` |
| `error.tsx` | Hiện khi có lỗi *(dự án này chưa dùng)* |

Lưu ý: thư mục `app/todos/` **không có** `page.tsx`, nên URL `/todos` là 404. Thư mục chỉ tạo ra đoạn đường dẫn; phải có `page.tsx` mới thành trang.

---

## 4. Đọc và ghi dữ liệu

### Đọc — gọi thẳng trong Server Component

```tsx
export default async function TodoListPage() {
  const todos = await getTodos();   // xong. Không useEffect, không state loading.
  return <ul>{todos.map(...)}</ul>;
}
```

Không cần `useEffect`, không cần `useState` cho loading, không cần React Query.

### Ghi — Server Action

```mermaid
sequenceDiagram
    participant B as Trình duyệt
    participant N as Server Next.js
    participant E as Express
    participant DB as PostgreSQL

    B->>N: Người dùng bấm "Thêm task"<br/>(gọi createTodoAction)
    N->>E: POST /api/todos
    E->>DB: INSERT
    DB-->>E: OK
    E-->>N: todo mới
    Note over N: revalidatePath("/")<br/>render lại trang danh sách
    N-->>B: Kết quả + giao diện đã cập nhật<br/><b>trong CÙNG một request</b>
```

Điểm mấu chốt: **một vòng gửi/nhận cho cả việc ghi lẫn việc cập nhật giao diện.**

Đây là lý do trong dự án này **không có `useState` nào giữ danh sách todo**. Server là nguồn sự thật duy nhất:

```
người dùng bấm → Server Action → ghi DB → revalidatePath → server render lại → props mới về client
```

### Hai cách gọi Server Action

| Tình huống | Cách dùng | Ví dụ trong dự án |
|---|---|---|
| Form có ô nhập | `<form action={...}>` + `useActionState` | `AddTodoForm`, `EditTodoForm` |
| Chỉ một cú bấm | `onClick` + `useTransition` | `TodoItem`, `TodoDetailActions` |

---

## 5. Về cache — vì sao code có `cache: "no-store"`

Next.js thay `fetch` gốc bằng phiên bản riêng có khả năng cache. Với app todo, cache là **có hại**: bạn thêm task xong mà trang vẫn hiện danh sách cũ thì trông như app hỏng.

Nên trong [src/lib/api.ts](src/lib/api.ts) mọi lời gọi đều dùng `cache: "no-store"` — luôn hỏi backend thật.

Hệ quả: chạy `npm run build` bạn sẽ thấy

```
┌ ƒ /
├ ○ /_not-found
├ ○ /icon.svg
└ ƒ /todos/[id]

○  (Static)   dựng sẵn HTML lúc build
ƒ  (Dynamic)  render lại ở mỗi request
```

Hai trang có dữ liệu đều là `ƒ` (Dynamic) — đúng như mong muốn.

---

## 6. Những cái bẫy hay gặp

| Bẫy | Triệu chứng | Cách sửa |
|---|---|---|
| Quên `await params` | `id` là `undefined` | `const { id } = await props.params` — từ Next.js 15, `params` là Promise |
| Dùng `next/router` | Lỗi import | App Router dùng `next/navigation` |
| `window` trong Server Component | `window is not defined` | Thêm `"use client"`, hoặc chuyển logic vào `useEffect` |
| Quên `name` trên input | `formData.get()` trả về `null` | Mỗi input gửi đi phải có `name` |
| `useState` trong Server Component | Báo lỗi lúc build | Thêm `"use client"` |
| Đặt `"use client"` ở `layout.tsx` | Mất hết lợi ích Server Component | Đẩy `"use client"` xuống càng sâu càng tốt |
| Dùng chỉ số mảng làm `key` | Xóa một dòng thì các dòng khác lỗi trạng thái | Dùng `id` từ database |
| Server Action không `async` | Lỗi lúc build | Mọi hàm export từ file `"use server"` phải là `async` |

---

## 7. Đăng nhập — token cất ở đâu và ai giữ cửa

Phần này giải thích ba quyết định thiết kế của tính năng đăng nhập. Chi tiết kỹ thuật của Cognito nằm ở `backend/LEARN.md` mục 10; ở đây chỉ bàn phần Next.js.

### Toàn cảnh: token đi những đâu

```mermaid
sequenceDiagram
    participant B as Trình duyệt
    participant N as Server Next.js
    participant E as Express
    participant C as Cognito

    B->>N: submit form /login (Server Action)
    N->>E: POST /api/auth/login
    E->>C: InitiateAuth
    C-->>E: accessToken + refreshToken + user
    E-->>N: 3 thứ trên
    N-->>B: Set-Cookie (httpOnly) × 3

    Note over B,N: Từ đây, mọi lần tải trang
    B->>N: GET / (cookie tự đính kèm)
    N->>N: đọc cookie → lấy accessToken
    N->>E: GET /api/todos + Bearer token
    E-->>N: todo của riêng người này
    N-->>B: HTML đã có sẵn dữ liệu
```

Điều đáng chú ý nhất: **token không bao giờ đi vào tầng JavaScript của trình duyệt**. Nó đi từ Express → server Next.js → cookie, và mỗi lần dùng thì server Next.js đọc lại từ cookie. Code chạy trong trình duyệt không có cách nào chạm tới.

### Quyết định 1 — Cookie `httpOnly`, không phải `localStorage`

Rất nhiều hướng dẫn trên mạng bảo lưu token vào `localStorage`. Đừng.

| Chỗ cất | JavaScript đọc được? | Sống qua F5? | Chống XSS? |
|---|---|---|---|
| `localStorage` | ✅ Có | ✅ | ❌ **Không** |
| React state | ❌ | ❌ Mất | ✅ |
| Cookie `httpOnly` | ❌ | ✅ | ✅ |

`localStorage` mở toang cho mọi đoạn script chạy trên trang — kể cả script đến từ một thư viện npm bị cài mã độc. Cookie `httpOnly` thì `document.cookie` không nhìn thấy, nên có XSS cũng không mang token đi đâu được.

Cách này khả thi là nhờ kiến trúc sẵn có: trình duyệt chỉ nói chuyện với server Next.js, và chính server đó mới gọi Express. Xem `src/lib/auth.ts`.

### Quyết định 2 — `proxy.ts` là lớp trải nghiệm, không phải lớp bảo mật

📌 Từ Next.js 16, `middleware.ts` đổi tên thành **`proxy.ts`**. Tài liệu cũ nhắc `middleware.ts` chính là file này.

`proxy.ts` chỉ nhìn xem cookie có tồn tại hay không — nó **không** kiểm chữ ký token. Ai cũng tự tạo được một cookie tên `access_token` với nội dung bịa để qua mặt nó.

Nhưng qua được cũng vô ích, vì lớp bảo vệ thật nằm ở Express. Bạn tự kiểm chứng được:

```bash
curl -H 'Cookie: access_token=toi-tu-bia-ra' http://localhost:3001/
```

Proxy cho qua (HTTP 200), rồi trang hiện hộp lỗi *"Phiên đăng nhập không hợp lệ hoặc đã hết hạn"* — câu đó đến từ `requireAuth` bên Express.

Đây là **phòng thủ nhiều lớp**, và mỗi lớp có một việc:

| Lớp | Ở đâu | Việc | Qua mặt được không? |
|---|---|---|---|
| Trải nghiệm | `proxy.ts` | Đưa người chưa đăng nhập tới form đăng nhập | Được, và không sao cả |
| **Bảo mật** | `requireAuth` (Express) | Kiểm chữ ký Cognito | **Không** — cần khoá riêng của AWS |
| **Bảo mật** | `todo.service.ts` | Mọi query kèm `WHERE userId` | **Không** |

Nguyên tắc rút ra: mọi thứ chạy gần người dùng đều có thể bị giả mạo. Chỉ những gì server tự kiểm chứng mới đáng tin.

### Quyết định 3 — Gia hạn token đặt trong `proxy.ts`

Access token sống 1 giờ. Nếu hết hạn là bắt đăng nhập lại thì không ai chịu nổi, nên proxy lặng lẽ dùng refresh token xin token mới.

Vì sao phải là proxy mà không phải `api.ts`? Vì gia hạn xong thì phải **lưu** token mới vào cookie, mà Next.js chỉ cho ghi cookie ở ba nơi:

| Nơi | Ghi cookie được? |
|---|---|
| Server Component (`page.tsx`) | ❌ Không |
| Server Action (`auth-actions.ts`) | ✅ Có |
| Route Handler | ✅ Có |
| `proxy.ts` | ✅ Có |

Lý do rất vật lý: `Set-Cookie` là một HTTP header, mà header phải đi **trước** nội dung. Tới lúc Server Component render thì header đã gửi đi rồi. Đây là cách HTTP vận hành, không phải hạn chế do Next.js đặt ra.

`api.ts` chủ yếu được gọi từ Server Component → không ghi cookie được → đặt phần gia hạn ở đó thì mỗi request lại phải gia hạn lại từ đầu vì không có chỗ cất kết quả.

Một mẹo nhỏ đáng để ý trong `auth.ts`: hạn của **cookie** access token được đặt bằng đúng hạn của **token** (trừ hao 1 phút). Nhờ vậy câu hỏi "token còn sống không?" trở thành "cookie còn đó không?" — trình duyệt tự xoá giúp, không cần so sánh thời gian ở đâu cả.

### Các file của phần đăng nhập

| File | Việc |
|---|---|
| [src/lib/auth.ts](src/lib/auth.ts) | Đọc/ghi cookie. Đọc file này trước. |
| [src/lib/auth-actions.ts](src/lib/auth-actions.ts) | Server Actions: đăng ký, xác thực, đăng nhập, đăng xuất |
| [src/proxy.ts](src/proxy.ts) | Chặn cửa + tự động gia hạn token |
| [src/components/LoginForm.tsx](src/components/LoginForm.tsx) | Form đăng nhập, `useActionState` |
| [src/components/ConfirmForm.tsx](src/components/ConfirmForm.tsx) | Hai action trên một trang |
| [src/components/UserMenu.tsx](src/components/UserMenu.tsx) | Nút bấm được mà vẫn là Server Component |

---

## 8. Thứ tự đọc code

Đọc theo thứ tự này sẽ thấy mọi thứ nối vào nhau:

1. **[src/lib/types.ts](src/lib/types.ts)** — hình dạng dữ liệu. Ngắn, dễ.
2. **[src/lib/api.ts](src/lib/api.ts)** — cách nói chuyện với backend. Vì sao chỉ chạy trên server.
3. **[src/app/layout.tsx](src/app/layout.tsx)** — khung bao ngoài, font, metadata.
4. **[src/app/page.tsx](src/app/page.tsx)** — Server Component đầu tiên. Đọc kỹ file này.
5. **[src/lib/actions.ts](src/lib/actions.ts)** — Server Action. File quan trọng nhất về khái niệm.
6. **[src/components/AddTodoForm.tsx](src/components/AddTodoForm.tsx)** — Client Component đầu tiên, form + `useActionState`.
7. **[src/components/TodoItem.tsx](src/components/TodoItem.tsx)** — cách khác: sự kiện + `useTransition`.
8. **[src/app/todos/[id]/page.tsx](src/app/todos/%5Bid%5D/page.tsx)** — route động, `params`, `notFound()`.
9. **[src/components/EditTodoForm.tsx](src/components/EditTodoForm.tsx)** — controlled form, file khó nhất.
10. **[src/components/TodoDetailActions.tsx](src/components/TodoDetailActions.tsx)** — `useRouter`, điều hướng bằng code.

Phần đăng nhập đọc sau, khi đã nắm mười file trên — bảng file nằm ở cuối mục 7.

---

## 9. Thử nghịch để hiểu sâu hơn

Vài thí nghiệm nhỏ, làm xong nhớ hoàn tác:

1. **Xóa `"use client"` khỏi `TodoItem.tsx`** → xem Next.js báo lỗi gì. Đó chính là cách bạn nhận ra một component cần là Client.
2. **Thêm `console.log("xin chào")` vào `app/page.tsx`** → dòng chữ hiện ở **terminal**, không phải console trình duyệt. Bằng chứng file đó chạy trên server.
3. **Xóa `revalidatePath` trong `createTodoAction`** → thêm task xong danh sách không đổi. Bấm F5 mới thấy. Đó là việc `revalidatePath` đang làm.
4. **Đổi `cache: "no-store"` thành `cache: "force-cache"`** trong `api.ts` → dữ liệu bị đóng băng.
5. **Tắt backend rồi tải lại trang** → thấy hộp lỗi thay vì màn hình lỗi đỏ. Đó là khối `try/catch` trong `app/page.tsx`.
6. **Đăng nhập, rồi mở DevTools → Application → Cookies** → thấy ba cookie, cột `HttpOnly` đều tick. Giờ gõ `document.cookie` vào Console: chuỗi trả về **không** chứa token. Đó là `httpOnly` đang làm việc.
7. **Xoá cookie `access_token` (giữ nguyên hai cookie kia) rồi F5** → trang vẫn hiện bình thường. Bạn vừa chứng kiến `proxy.ts` tự gia hạn token mà không làm phiền ai.
8. **Xoá cả ba cookie rồi F5** → bị đá về `/login?next=/`. Đăng nhập lại sẽ quay đúng về trang cũ.
9. **Đăng ký tài khoản thứ hai, tạo vài todo, rồi đăng nhập lại bằng tài khoản đầu** → danh sách của mỗi người tách bạch hoàn toàn. Đây là bằng chứng cuối cùng rằng tính năng chạy đúng.

---

## 10. Đọc thêm

Bản Next.js dùng ở đây (16.3.2) có tài liệu **nằm sẵn trong máy**, không cần lên mạng:

```bash
ls node_modules/next/dist/docs/01-app/01-getting-started/
```

Nên đọc bản này thay vì tra Google, vì rất nhiều bài trên mạng viết cho Pages Router (kiến trúc cũ) và sẽ không chạy với dự án này.
