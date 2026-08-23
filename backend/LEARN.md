# Học Express + Prisma qua chính dự án này

Tài liệu này giải thích **bức tranh lớn** — những thứ khó nhét vừa vào comment trong code. Đọc file này trước, rồi mở code đọc comment sẽ dễ hiểu hơn nhiều.

Backend này làm đúng một việc: cung cấp API quản lý danh sách công việc (todo) cho frontend Next.js ở thư mục bên cạnh.

---

## 1. Backend này là cái gì?

Nó là một **API server**: một chương trình chạy liên tục, lắng nghe ở cổng 3000, nhận request HTTP và trả về **JSON** (không trả về HTML — việc dựng giao diện là của frontend).

Toàn cảnh hệ thống:

```mermaid
flowchart LR
    B["Trình duyệt"] --> N["Server Next.js<br/>(frontend, cổng 3001)"]
    N -->|"HTTP + JSON"| E["Server Express<br/>(backend, cổng 3000)"]
    E -->|"SQL qua Prisma"| P[("PostgreSQL<br/>cổng 5432")]
```

Điều đáng chú ý: **trình duyệt không gọi thẳng Express**. Nó nói chuyện với server Next.js, và server Next.js mới gọi Express. Nhờ vậy địa chỉ backend không bị lộ ra ngoài, và sau này muốn thêm token xác thực thì giấu ở tầng giữa được.

---

## 2. Vòng đời một request — phần quan trọng nhất

Hãy theo dõi đúng một lần bấm nút "thêm task", đi từ đầu tới cuối:

```mermaid
sequenceDiagram
    participant C as Client
    participant A as app.ts<br/>(middleware)
    participant R as routes
    participant Ctl as controller
    participant Z as zod schema
    participant S as service
    participant DB as PostgreSQL

    C->>A: POST /api/todos<br/>{"content":"Học Express"}
    A->>A: cors() gắn header cho phép
    A->>A: express.json() đọc body → req.body
    A->>R: khớp URL + phương thức
    R->>Ctl: gọi createTodo(req, res, next)
    Ctl->>Z: createTodoSchema.parse(req.body)
    Z-->>Ctl: { content: "Học Express" } đã sạch
    Ctl->>S: todoService.createTodo(content)
    S->>DB: INSERT INTO "Todo" ...
    DB-->>S: bản ghi đầy đủ (có id)
    S-->>Ctl: Todo
    Ctl-->>C: 201 { success: true, data: {...} }
```

Nhìn kỹ sẽ thấy mỗi trạm chỉ làm **đúng một việc** và không lấn sân trạm khác. Đó là toàn bộ triết lý của kiến trúc này.

### Khi có lỗi thì luồng đi đường khác

```mermaid
flowchart TD
    A["zod .parse() thất bại<br/>hoặc service throw AppError"] --> B["catch (err) trong controller"]
    B -->|"next(err)"| C{"errorHandler<br/>phân loại"}
    C -->|"ZodError"| D["400 — dữ liệu sai<br/>+ danh sách lỗi từng trường"]
    C -->|"AppError"| E["dùng statusCode kèm theo<br/>thường là 404"]
    C -->|"lỗi lạ"| F["console.error(err)<br/>rồi trả 500 chung chung"]
```

Điểm mấu chốt: `next(err)` khiến Express **nhảy cóc** qua toàn bộ middleware thường còn lại, đi thẳng tới middleware xử lý lỗi. Nhờ vậy không controller nào phải tự viết code trả lỗi.

---

## 3. Bốn tầng và ranh giới giữa chúng

```mermaid
flowchart TD
    R["routes/<br/>Bản đồ URL → hàm"] --> C["controllers/<br/>BIẾT HTTP: req, res, status"]
    C --> S["services/<br/>BIẾT nghiệp vụ + database"]
    S --> P["lib/prisma.ts<br/>kết nối database"]
    C -.->|"validate"| Z["schemas/<br/>luật kiểm tra dữ liệu"]
    S -.->|"ném lỗi"| E["utils/AppError.ts"]
```

Quy tắc để nhớ ranh giới:

| Tầng | Được phép biết | KHÔNG được biết |
|---|---|---|
| `controllers/` | `req`, `res`, mã status HTTP | database là Postgres hay MongoDB |
| `services/` | Prisma, nghiệp vụ | HTTP là gì (không có `req`, `res`) |

Cách kiểm tra nhanh xem mình có viết sai tầng không: mở file trong `services/` và tìm chữ `res.` — nếu thấy, tức là logic HTTP đã lọt xuống nhầm chỗ.

**Vì sao đáng công chia tầng như vậy?**

- Đổi database sang thứ khác → chỉ sửa `services/`.
- Viết script nhập liệu hàng loạt → gọi thẳng `services/`, không cần dựng server.
- Viết test cho nghiệp vụ → test hàm thuần, dễ hơn nhiều so với phải giả lập request.

---

## 4. Middleware — khái niệm cốt lõi của Express

Một request đi qua **dây chuyền** các hàm, xếp đúng theo thứ tự bạn viết `app.use(...)` trong [src/app.ts](src/app.ts):

```mermaid
flowchart LR
    Q(["Request"]) --> C["cors()"] --> J["express.json()"] --> T["/api/todos<br/>todoRoutes"] --> N["notFound"] --> E["errorHandler"] --> X(["Response"])
```

Mỗi middleware có dạng `(req, res, next)` và chỉ có **hai lựa chọn**:

1. **Trả lời luôn** — gọi `res.json(...)`. Dây chuyền dừng tại đó.
2. **Đi tiếp** — gọi `next()`.

Quên cả hai là lỗi kinh điển: request treo lơ lửng cho tới khi trình duyệt bỏ cuộc.

**Thứ tự là tất cả.** Đảo `app.use(notFound)` lên trước `todoRoutes` thì mọi request đều thành 404, vì bị chặn ngay từ cửa đầu.

---

## 5. Prisma hoạt động ra sao?

Prisma là **ORM** — cầu nối giữa object trong JavaScript và bảng trong database. Bạn viết `prisma.todo.findMany()`, nó dịch thành `SELECT * FROM "Todo"`.

### Vòng đời khi bạn sửa cấu trúc bảng

```mermaid
flowchart TD
    A["Bạn sửa prisma/schema.prisma"] --> B["npm run prisma:migrate"]
    B --> C["Sinh file .sql trong prisma/migrations/"]
    B --> D["Chạy file .sql lên PostgreSQL thật"]
    B --> E["Sinh lại code TS trong node_modules/@prisma/client"]
    E --> F["TypeScript hiểu cấu trúc mới,<br/>editor gợi ý đúng trường"]
```

**Phép màu của Prisma đến từ bước sinh code**, không phải từ phép thuật lúc chạy. `prisma.todo` tồn tại là vì bạn đã khai `model Todo` và đã chạy generate. Đây cũng chính là chỗ vấp phổ biến nhất: sửa schema mà quên chạy lại lệnh, rồi ngồi nhìn lỗi "Property does not exist" mà không hiểu vì sao.

### Ba lệnh cần phân biệt

| Lệnh | Làm gì | Chạy khi nào |
|---|---|---|
| `npm run prisma:generate` | Chỉ sinh code TypeScript, **không** đụng database | Vừa clone dự án về, vừa `npm install` |
| `npm run prisma:migrate` | Sinh SQL + chạy lên database + generate luôn | Vừa sửa `schema.prisma` |
| `npm run prisma:studio` | Mở giao diện web xem/sửa dữ liệu | Khi muốn nhìn dữ liệu thật |

### Vì sao Prisma an toàn hơn viết SQL tay

Prisma luôn tách dữ liệu khỏi câu lệnh, nên kể cả khi người dùng gõ nội dung todo là `'; DROP TABLE "Todo"; --` thì đó vẫn chỉ là một chuỗi văn bản vô hại được lưu vào cột `content`. Lỗ hổng SQL injection không có đất sống.

---

## 6. Validate — vì sao TypeScript không đủ?

Câu cần nhớ:

> **TypeScript chỉ tồn tại lúc bạn viết code. Lúc chạy thật, nó biến mất.**

Mọi khai báo kiểu bị xoá sạch khi biên dịch sang JavaScript. Nên `req.body.content as string` chỉ là một lời hứa suông — lúc chạy nó có thể là số, là `null`, hoặc không tồn tại.

Mà dữ liệu thì đến từ **bên ngoài**: bất kỳ ai cũng có thể mở terminal gõ `curl` gửi thẳng bất cứ thứ gì. Frontend kiểm tra kỹ đến đâu cũng vô nghĩa, vì kẻ gửi request không bắt buộc phải dùng frontend của bạn.

**zod** lấp đúng khoảng trống đó: kiểm tra thật lúc chạy, đồng thời cho TypeScript biết kiểu dữ liệu sau kiểm tra.

```mermaid
flowchart LR
    A["req.params.id<br/>= chuỗi &quot;7&quot;"] --> B["z.coerce.number()<br/>ép về số 7"] --> C[".int().positive()<br/>kiểm tra"] --> D["id: number<br/>an toàn, đúng kiểu"]
```

Nguyên tắc: **validate ở biên**. Chỉ kiểm tra một lần duy nhất tại cửa vào (controller). Từ sau ranh giới đó, mọi tầng bên trong tin tưởng tuyệt đối — đó là lý do tầng service sạch sẽ, không có dòng `if (!content)` nào.

---

## 7. Cấu trúc thư mục và thứ tự đọc code

Đọc theo đúng thứ tự này, mỗi file đều được chuẩn bị bởi file trước đó:

1. **[src/index.ts](src/index.ts)** — điểm khởi động, `dotenv`, `app.listen`.
2. **[src/app.ts](src/app.ts)** — dây chuyền middleware. **File quan trọng nhất.**
3. **[src/routes/todo.routes.ts](src/routes/todo.routes.ts)** — bản đồ URL, đọc 30 giây là nắm hết API.
4. **[src/controllers/todo.controller.ts](src/controllers/todo.controller.ts)** — `req`/`res`/`next`, khuôn `try/catch → next(err)`.
5. **[src/schemas/todo.schema.ts](src/schemas/todo.schema.ts)** — luật validate với zod.
6. **[src/services/todo.service.ts](src/services/todo.service.ts)** — Prisma và nghiệp vụ.
7. **[prisma/schema.prisma](prisma/schema.prisma)** — cấu trúc bảng.
8. **[src/lib/prisma.ts](src/lib/prisma.ts)** — vì sao chỉ tạo một `PrismaClient` duy nhất.
9. **[src/middlewares/errorHandler.ts](src/middlewares/errorHandler.ts)** — quy ước 4 tham số.
10. **[src/utils/AppError.ts](src/utils/AppError.ts)** — lỗi mang theo mã status.

Phần xác thực đọc sau, khi đã nắm được mười file trên. Thứ tự riêng của nó:

11. **[src/lib/cognito.ts](src/lib/cognito.ts)** — ba loại token, JWKS, `SECRET_HASH`. Đọc đầu tiên trong nhóm này.
12. **[src/middlewares/requireAuth.ts](src/middlewares/requireAuth.ts)** — người gác cổng, chỗ `req.user` sinh ra.
13. **[src/schemas/auth.schema.ts](src/schemas/auth.schema.ts)** — luật validate cho email, mật khẩu, mã 6 số.
14. **[src/services/auth.service.ts](src/services/auth.service.ts)** — gọi Cognito và dịch lỗi AWS sang tiếng Việt.
15. **[src/controllers/auth.controller.ts](src/controllers/auth.controller.ts)** — sáu API xác thực.
16. **[src/types/express.d.ts](src/types/express.d.ts)** — cách khai báo thêm `req.user` cho TypeScript.

---

## 8. Bảng API đầy đủ

**Toàn bộ route `/api/todos` đều yêu cầu header `Authorization: Bearer <accessToken>`.** Thiếu header là nhận 401 ngay, không có ngoại lệ — xem mục 10 để hiểu vì sao và bằng cách nào.

Và mọi kết quả đều đã được lọc theo người đang gọi: "mảng todo" dưới đây nghĩa là *todo của riêng bạn*, không phải toàn bộ bảng.

| Phương thức | Đường dẫn | Body | Trả về |
|---|---|---|---|
| GET | `/api/todos` | — | Mảng todo **của bạn**, mới nhất trước |
| GET | `/api/todos/:id` | — | Một todo của bạn, hoặc 404 |
| POST | `/api/todos` | `{ "content": "..." }` | 201 + todo vừa tạo (gắn sẵn `userId` của bạn) |
| PUT | `/api/todos/:id` | `{ "content": "..." }` | Todo sau khi sửa |
| PATCH | `/api/todos/:id/done` | — | Todo đã đánh dấu xong |
| PATCH | `/api/todos/:id/undone` | — | Todo đã bỏ đánh dấu |
| DELETE | `/api/todos/:id` | — | `{ success, message }` |

Todo của người khác luôn trả về **404**, không phải 403 — cố ý như vậy, lý do ở mục 10.

Bảng API xác thực (`/api/auth/*`) nằm riêng ở mục 10.

Mọi phản hồi đều được gói trong một "phong bì" cố định:

```json
{ "success": true,  "data": ... }
{ "success": false, "message": "..." }
```

Nhờ vậy frontend chỉ cần viết **một** hàm bóc phong bì dùng chung cho mọi lời gọi.

---

## 9. Chạy thử bằng dòng lệnh

Không cần frontend, `curl` là đủ. Nhưng từ khi có đăng nhập thì phải lấy token trước.

**Bước 1 — đăng nhập lấy token** (tài khoản phải đã xác thực email):

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ban@example.com","password":"MatKhau123!"}'
```

Để đỡ phải copy chuỗi token dài loằng ngoằng, cất luôn vào biến shell:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ban@example.com","password":"MatKhau123!"}' \
  | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

echo "${TOKEN:0:40}..."   # in ra 40 ký tự đầu để chắc là đã lấy được
```

**Bước 2 — gọi API kèm token:**

```bash
# Lấy danh sách (chỉ todo của bạn)
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/todos

# Tạo mới
curl -X POST http://localhost:3000/api/todos \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Học Express"}'

# Đánh dấu xong
curl -X PATCH -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/todos/1/done

# Xoá
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/todos/1
```

**Thử bỏ token đi** để thấy người gác cổng làm việc:

```bash
curl -i http://localhost:3000/api/todos
# HTTP/1.1 401 Unauthorized
# {"success":false,"message":"Bạn cần đăng nhập để thực hiện thao tác này."}
```

Lưu ý: access token chỉ sống **1 giờ**. Hết hạn thì chạy lại Bước 1.

---

## 10. Xác thực bằng AWS Cognito — "chỉ thấy ghi chú của mình"

Phần này là thứ mới nhất và cũng đáng đọc nhất trong dự án. Trước khi đọc code, hãy nắm ba ý sau — chúng là toàn bộ câu chuyện.

### Ý 1 — Cognito chỉ trả lời "anh là ai", không giữ dữ liệu của bạn

Cognito lưu danh sách người dùng và mật khẩu. Nó **không** lưu todo. Khi đăng nhập thành công, nó đưa lại một tấm "hộ chiếu" đã ký gọi là **JWT**, bên trong có `sub` — mã định danh vĩnh viễn của tài khoản đó.

`sub` ấy chính là giá trị nằm ở cột `Todo.userId` trong PostgreSQL. Đó là toàn bộ sợi dây nối giữa hai hệ thống.

### Ý 2 — Backend tự kiểm hộ chiếu, không hỏi lại Cognito

Đây là điểm mà người mới hay hiểu sai nhất.

```mermaid
sequenceDiagram
    participant C as Client
    participant E as Express
    participant K as Cognito JWKS
    participant DB as PostgreSQL

    Note over E,K: CHỈ LẦN ĐẦU TIÊN
    E->>K: tải bộ khoá công khai (jwks.json)
    K-->>E: public keys → cache trong RAM

    Note over C,DB: MỌI REQUEST SAU ĐÓ
    C->>E: GET /api/todos<br/>Authorization: Bearer eyJ...
    E->>E: kiểm chữ ký bằng khoá đã cache<br/>(KHÔNG gọi mạng)
    E->>E: lấy sub từ token → req.user.sub
    E->>DB: SELECT * FROM "Todo" WHERE "userId" = sub
    DB-->>E: chỉ todo của người này
    E-->>C: 200 { success: true, data: [...] }
```

Cognito ký token bằng **khoá riêng** mà chỉ nó giữ. Ai cũng tải được **khoá công khai** để kiểm chữ ký, nhưng không ai tạo được chữ ký giả. Nên Express chỉ cần tải khoá công khai một lần rồi tự kiểm mọi token tại chỗ.

Hệ quả thực tế: API chạy nhanh, và Cognito có sập thì người đang đăng nhập vẫn dùng app bình thường (chỉ không đăng nhập mới được).

### Ý 3 — `userId` đến từ chữ ký, không đến từ client

Đây là ý quan trọng nhất về mặt bảo mật.

`requireAuth` đọc `sub` **từ bên trong token đã kiểm chữ ký** rồi gắn vào `req.user`. Client không có cách nào ảnh hưởng tới giá trị đó. Nếu thay vào đó ta cho client gửi `userId` trong body, thì ai cũng sửa được một con số trong DevTools để đọc todo của người khác.

Và mọi câu query trong `todo.service.ts` đều kèm `userId`:

```ts
// SAI — ai đoán đúng id là đọc được todo người khác (lỗ hổng IDOR)
prisma.todo.findUnique({ where: { id } })

// ĐÚNG — phải thoả cả hai điều kiện
prisma.todo.findFirst({ where: { id, userId } })
```

### Các file liên quan, theo thứ tự nên đọc

| Thứ tự | File | Vai trò |
|---|---|---|
| 1 | `src/lib/cognito.ts` | Cấu hình, `SECRET_HASH`, hai verifier. **Đọc file này trước** — nó giải thích ba loại token. |
| 2 | `src/middlewares/requireAuth.ts` | Người gác cổng: đọc header, kiểm token, gắn `req.user` |
| 3 | `src/services/auth.service.ts` | Gọi Cognito: đăng ký, xác thực, đăng nhập, gia hạn |
| 4 | `src/services/todo.service.ts` | Mọi query đều kèm `userId` — phần chống IDOR |
| 5 | `src/routes/todo.routes.ts` | Một dòng `router.use(requireAuth)` bảo vệ toàn bộ |

### Ba loại token — bảng tra nhanh

| Token | Sống | Chứa gì | Dùng làm gì |
|---|---|---|---|
| **ID token** | 1 giờ | email, tên, `sub` | Biết người dùng LÀ AI → để hiển thị |
| **Access token** | 1 giờ | `sub`, `username`, scope | Gửi kèm mỗi request API → để mở cửa |
| **Refresh token** | 30 ngày | (chuỗi mờ) | Đổi lấy hai token trên khi chúng hết hạn |

Vì sao chia ba? Access token đi ra vào mạng ở **mọi** request nên rủi ro lộ cao → cho sống ngắn. Refresh token hiếm khi được gửi đi → cho sống dài được. Tách đôi trách nhiệm để vừa tiện vừa an toàn.

### Bảng API xác thực

| Method | Đường dẫn | Cần token? | Việc |
|---|---|---|---|
| POST | `/api/auth/register` | Không | Tạo tài khoản, Cognito gửi mã 6 số về email |
| POST | `/api/auth/confirm` | Không | Nhập mã 6 số để kích hoạt |
| POST | `/api/auth/resend-code` | Không | Gửi lại mã |
| POST | `/api/auth/login` | Không | Đổi email + mật khẩu lấy 3 token |
| POST | `/api/auth/refresh` | Không* | Đổi refresh token lấy access token mới |
| GET | `/api/auth/me` | **Có** | Trả về danh tính đọc từ token |

\* `/refresh` không cần *access* token (nó được gọi đúng lúc access token đã hết hạn), nhưng vẫn phải có refresh token hợp lệ — Cognito từ chối ngay nếu không.

### Ba cái bẫy của Cognito, đã gặp và đã xử lý trong code này

1. **`ALLOW_USER_PASSWORD_AUTH` mặc định TẮT.** Quên tick trong AWS Console → lỗi `USER_PASSWORD_AUTH flow not enabled for this client`. Xem `.note/cognito-setup.md` mục 4.10.

2. **`SECRET_HASH` lúc refresh phải tính bằng `cognito:username`, không phải email.** Luồng `USER_PASSWORD_AUTH` tính bằng email (vì email nằm ở tham số `USERNAME`), nhưng luồng `REFRESH_TOKEN_AUTH` không có tham số đó nên Cognito dùng tên đăng nhập thật — một chuỗi UUID. Sai chỗ này thì nhận lỗi `Unable to verify secret hash for client`, một thông báo không gợi ý gì cả. Đây là lý do `login()` phải trả thêm `username` về cho frontend giữ.

3. **`/refresh` không trả về refresh token mới.** Refresh token cũ vẫn dùng tiếp tới khi hết 30 ngày. Vô tình ghi đè nó bằng `undefined` thì người dùng bị đá ra sau đúng một giờ.

---

## 11. Những cái bẫy hay gặp

1. **`req.body` là `undefined`** → quên `app.use(express.json())`, hoặc client không gửi header `Content-Type: application/json`.
2. **Middleware lỗi không bao giờ chạy** → thiếu tham số thứ tư. Express nhận diện middleware lỗi bằng cách **đếm số tham số**; phải đủ `(err, req, res, next)` dù không dùng tới `next`.
3. **`req.params.id` là chuỗi, không phải số** → mọi thứ lấy từ URL đều là văn bản. Phải `z.coerce.number()` trước khi đưa xuống database.
4. **Sửa `schema.prisma` mà quên `npm run prisma:migrate`** → TypeScript vẫn nhìn thấy cấu trúc cũ, báo lỗi khó hiểu.
5. **`return prisma.todo.delete(...)` thay vì `return await ...` trong khối `try`** → thiếu `await` thì Promise thoát ra ngoài rồi mới lỗi, lúc đó `try/catch` đã kết thúc và không bắt được gì.
6. **Lỗi CORS** → đó là luật của **trình duyệt**, không phải của server. Gọi bằng `curl` hay Postman không bao giờ dính. Và request vẫn tới được backend, vẫn chạy thật — trình duyệt chỉ chặn ở bước cuối, không cho JavaScript đọc kết quả.
7. **`import "dotenv/config"` không nằm ở dòng đầu `index.ts`** → Prisma khởi tạo trước khi `.env` được nạp, báo lỗi thiếu `DATABASE_URL`.
8. **Đảo thứ tự `.trim()` và `.min(1)` trong zod** → chuỗi toàn dấu cách `"   "` sẽ lọt qua.

---

## 12. Thử nghịch để hiểu sâu hơn

Vài thí nghiệm nhỏ, làm xong nhớ hoàn tác:

1. **Xoá `app.use(express.json())` trong `app.ts`** → gửi POST và xem `req.body` thành `undefined`.
2. **Đổi `app.use(notFound)` lên trước `app.use("/api/todos", ...)`** → mọi request thành 404. Bằng chứng thứ tự middleware quyết định tất cả.
3. **Xoá tham số `next` khỏi `errorHandler`** → gây một lỗi bất kỳ, xem request treo thay vì trả 500.
4. **Thêm `console.log(req.method, req.url)` vào đầu `app.ts` dưới dạng `app.use((req,res,next)=>{...; next()})`** → tự viết một middleware ghi log đầu tiên trong đời.
5. **Gọi `curl http://localhost:3000/api/todos/abc`** → xem zod chặn lại và trả 400 kèm mô tả, chứ không phải 500.
6. **Tắt Postgres (`docker compose stop`) rồi gọi API** → xem nhánh 500 của `errorHandler` hoạt động, và stack trace hiện trong terminal chứ không lộ ra cho khách.
7. **Xoá dòng `router.use(requireAuth)` trong `todo.routes.ts`** → gọi `curl http://localhost:3000/api/todos` không kèm token. Bạn sẽ thấy lỗi 401 từ `getUserId()` trong controller thay vì dữ liệu — đó là lớp phòng thủ thứ hai đang làm việc.
8. **Đăng ký hai tài khoản, mỗi tài khoản tạo vài todo, rồi lấy `id` todo của tài khoản A đem gọi bằng token của tài khoản B** → nhận 404 chứ không phải 403. Đọc lại phần giải thích trong `todo.service.ts` để hiểu vì sao 404 mới là câu trả lời đúng.
9. **Trong `todo.service.ts`, đổi `findFirst({ where: { id, userId } })` thành `findUnique({ where: { id } })`** → làm lại thí nghiệm 8 và xem lỗ hổng IDOR xuất hiện ngay trước mắt. Nhớ hoàn tác.

---

## 13. Đọc thêm

- Express: <https://expressjs.com/en/guide/routing.html> và trang "Writing middleware" — hai trang đủ để nắm 90% Express.
- Prisma: <https://www.prisma.io/docs/orm/prisma-client/queries/crud> — danh sách đầy đủ `findMany`, `create`, `update`...
- Zod: <https://zod.dev> — trang chủ chính là tài liệu.

Lưu ý khi tra Google: rất nhiều bài viết cũ dành cho **Express 4**. Dự án này dùng **Express 5**, khác biệt lớn nhất là Express 5 tự động bắt lỗi từ hàm `async` — nhưng code ở đây vẫn viết `try/catch` tường minh để ý đồ hiện rõ và để bạn quen với khuôn phổ biến ngoài kia.
