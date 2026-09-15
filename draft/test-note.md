# Test verify API (curl) sau khi code xong

Mục đích: sau khi viết xong code, chạy `npm run dev` rồi dùng curl gọi lần lượt cả 6 API
để xác nhận chạy đúng với DB Postgres thật (không chỉ dựa vào build/tsc không lỗi).

## 1. GET all (lúc DB rỗng)

```
curl -s http://localhost:3000/api/todos
```
```json
{"success":true,"data":[]}
```

## 2. POST create

```
curl -s -X POST http://localhost:3000/api/todos -H "Content-Type: application/json" -d '{"content":"Mua sua"}'
```
```json
{"success":true,"data":{"id":1,"content":"Mua sua","isDone":false,"createdAt":"2026-07-23T18:03:23.865Z","updatedAt":"2026-07-23T18:03:23.865Z"}}
```

```
curl -s -X POST http://localhost:3000/api/todos -H "Content-Type: application/json" -d '{"content":"Hoc bai"}'
```
```json
{"success":true,"data":{"id":2,"content":"Hoc bai","isDone":false,"createdAt":"2026-07-23T18:03:23.950Z","updatedAt":"2026-07-23T18:03:23.950Z"}}
```

## 3. GET all (sau khi có 2 todo)

```
curl -s http://localhost:3000/api/todos
```
```json
{"success":true,"data":[{"id":2,"content":"Hoc bai","isDone":false,...},{"id":1,"content":"Mua sua","isDone":false,...}]}
```

## 4. PUT update content

```
curl -s -X PUT http://localhost:3000/api/todos/1 -H "Content-Type: application/json" -d '{"content":"Mua sua tuoi"}'
```
```json
{"success":true,"data":{"id":1,"content":"Mua sua tuoi","isDone":false,...,"updatedAt":"2026-07-23T18:03:32.281Z"}}
```

## 5. PATCH done

```
curl -s -X PATCH http://localhost:3000/api/todos/1/done
```
```json
{"success":true,"data":{"id":1,"content":"Mua sua tuoi","isDone":true,...}}
```

## 6. PATCH undone

```
curl -s -X PATCH http://localhost:3000/api/todos/1/undone
```
```json
{"success":true,"data":{"id":1,"content":"Mua sua tuoi","isDone":false,...}}
```

## 7. DELETE

```
curl -s -X DELETE http://localhost:3000/api/todos/2
```
```json
{"success":true,"message":"Đã xóa todo"}
```

```
curl -s http://localhost:3000/api/todos
```
```json
{"success":true,"data":[{"id":1,"content":"Mua sua tuoi","isDone":false,...}]}
```

## 8. Test case lỗi — validate (content rỗng)

```
curl -s -w "\nSTATUS:%{http_code}\n" -X POST http://localhost:3000/api/todos -H "Content-Type: application/json" -d '{"content":""}'
```
```json
{"success":false,"message":"Dữ liệu không hợp lệ","errors":[{"path":"content","message":"content không được để trống"}]}
STATUS:400
```

## 9. Test case lỗi — not found (id không tồn tại)

```
curl -s -w "\nSTATUS:%{http_code}\n" -X PATCH http://localhost:3000/api/todos/999/done
```
```json
{"success":false,"message":"Không tìm thấy todo với id 999"}
STATUS:404
```

## Kết luận
- Cả 6 API chính đều trả đúng dữ liệu và đúng status code.
- 2 case lỗi (validate 400, not found 404) đều được middleware xử lý lỗi bắt đúng.
- Server dev (`npm run dev`) vẫn đang chạy nền tại http://localhost:3000 sau khi test xong.
