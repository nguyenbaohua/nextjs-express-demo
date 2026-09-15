# Frontend — Next.js 16 (App Router)

Giao diện của ứng dụng todo-list. Nó **không** nói chuyện trực tiếp với database:
mọi dữ liệu đều đi qua backend Express ở thư mục `../backend`.

## Chạy

```bash
cp .env.example .env.local
npm install
npm run dev          # http://localhost:3001
```

Backend phải chạy trước, nếu không mọi trang sẽ hiện lỗi *"Không kết nối được tới
server"*. Xem [docs/01-cai-dat-va-chay.md](../docs/01-cai-dat-va-chay.md).

## Lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev` | Server phát triển, cổng 3001 |
| `npm run build` | Build production (kèm typecheck) |
| `npm start` | Chạy bản đã build |
| `npm run lint` | ESLint |

Chạy `npm run build` một lần là đáng, chỉ để xem bảng route và đối chiếu dấu
`ƒ` (Dynamic) / `○` (Static) với những gì bạn viết trong code.

## Biến môi trường

```bash
API_BASE_URL=http://localhost:3000/api
```

Chỉ một biến, và nó cố tình **không** có tiền tố `NEXT_PUBLIC_`. Next.js chỉ gửi
xuống trình duyệt những biến có tiền tố đó — nên địa chỉ backend chỉ tồn tại phía
server và không bao giờ lộ ra ngoài.

## Cấu trúc

```
src/
├── app/         CHỈ routing (page, layout, loading, not-found)
├── features/    nghiệp vụ: auth/, todos/
├── shared/      hạ tầng dùng chung: api/, lib/, config/, types/, components/
└── proxy.ts     chặn cửa + tự động gia hạn token
```

Luật quan trọng nhất: **`features/` được import từ `shared/`, nhưng `shared/`
không bao giờ import từ `features/`.** Lý do và cách quyết định một file nên nằm
đâu: [docs/04-cau-truc-thu-muc.md](../docs/04-cau-truc-thu-muc.md).

## Học

- **[LEARN.md](LEARN.md)** — Server Component vs Client Component, Server Action,
  cache, cookie `httpOnly`, và thứ tự nên đọc code.
- **[../docs/](../docs/README.md)** — bộ tài liệu đầy đủ cho cả hai phía.

Mọi file trong `src/` đều có comment giải thích không chỉ "làm gì" mà cả "vì sao
làm vậy" và "làm cách khác thì hỏng thế nào".
