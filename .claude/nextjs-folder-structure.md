# Tiêu Chuẩn Cấu Trúc Thư Mục Next.js
---
# Mục Tiêu
Tài liệu này định nghĩa cấu trúc thư mục chuẩn cho tất cả dự án Next.js trong hệ thống.
Mục tiêu:
- Dễ mở rộng
- Dễ bảo trì
- Dễ refactor
- Hỗ trợ nhiều developer cùng làm việc
- Giảm phụ thuộc vào framework
- Hỗ trợ AI Agent Coding
- Dễ migrate trong tương lai
- Ranh giới nghiệp vụ rõ ràng
---
# Triết Lý Thiết Kế
## 1. Chỉ Sử Dụng `app/` Cho Routing
Thư mục `app/` thuộc về Next.js.

Nó chỉ nên chứa:
- Routing
- Layout
- Loading Page
- Error Page
- Not Found Page
- Route Handler
- Route Group

Nó không nên chứa:
- Business logic
- Component nghiệp vụ
- API client
- Service
- Repository
- Validation
- Business hook

Không tốt:
```txt
app/
└── users/
 ├── page.tsx
 ├── UserTable.tsx
 ├── useUsers.ts
 ├── user.service.ts
 └── user.schema.ts
```
Tốt:
```txt
app/
└── users/
 └── page.tsx
features/
└── users/
 ├── components/
 ├── hooks/
 ├── services/
 └── schemas/
```
---
## 2. Tổ Chức Theo Feature
Tổ chức mã nguồn theo nghiệp vụ thay vì loại kỹ thuật.
Không tốt:
```txt
src/
├── components/
├── hooks/
├── services/
├── validators/
└── types/
```
Tốt:
```txt
src/
├── features/
│  ├── auth/
│  ├── users/
│  ├── vehicles/
│  ├── reports/
│  └── settings/
```
Chỉ cần nhìn cấu trúc thư mục là hiểu hệ thống đang có những nghiệp vụ gì.
---
## 3. Giảm Phụ Thuộc Vào Next.js
Business code không nên phụ thuộc chặt vào App Router.
Nguyên tắc:
> Next.js chỉ là framework.
>
> Business logic mới là tài sản của hệ thống.
Nếu sau này cần chuyển sang:
```txt
Next.js App Router
↓
Next.js Pages Router
↓
React Router
↓
TanStack Router
↓
React Native
```
thì phần lớn business code vẫn giữ nguyên.
Chỉ cần thay đổi routing layer.
---
## 4. Tối Ưu Cho AI Agent Coding
AI Agent thường hoạt động tốt hơn khi code được chia theo nghiệp vụ.
Tốt:
```txt
features/
└── users/
 ├── components/
 ├── hooks/
 ├── services/
 ├── schemas/
 └── types/
```
Không tốt:
```txt
components/
hooks/
services/
types/
```
Lý do:
- Ngữ cảnh nhỏ hơn
- Dễ hiểu feature hơn
- Dễ sinh code hơn
- Dễ refactor hơn
- Ít ảnh hưởng feature khác

