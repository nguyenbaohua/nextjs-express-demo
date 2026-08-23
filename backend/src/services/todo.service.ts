/*
 * ============================================================================
 * SERVICE — tầng nghiệp vụ, nơi DUY NHẤT nói chuyện với database
 * ============================================================================
 *
 * Điểm cần để ý ngay: trong file này KHÔNG có `req`, `res`, `next`, không có mã
 * status HTTP. Đó không phải tình cờ mà là nguyên tắc — tầng này hoàn toàn
 * không biết nó đang được gọi từ một web server. Nếu mai bạn viết một script
 * dòng lệnh để nhập hàng loạt todo, bạn `import` thẳng các hàm ở đây và dùng.
 *
 * ---------------------------------------------------------------------------
 * PRISMA LÀ GÌ?
 * ---------------------------------------------------------------------------
 * Prisma là một ORM ("Object–Relational Mapper"): cầu nối giữa OBJECT trong
 * JavaScript và BẢNG trong cơ sở dữ liệu quan hệ. Không có nó, bạn phải tự viết
 * chuỗi SQL:
 *
 *     const result = await client.query(
 *       'SELECT * FROM "Todo" WHERE id = $1', [id]
 *     );
 *     const todo = result.rows[0];   // kiểu dữ liệu? TypeScript chịu, `any`.
 *
 * Với Prisma:
 *
 *     const todo = await prisma.todo.findUnique({ where: { id } });
 *     //    ^ TypeScript biết chính xác đây là Todo | null,
 *     //      biết có các trường id, content, isDone, createdAt, updatedAt
 *
 * Ba cái lợi lớn nhất:
 *   1. AN TOÀN KIỂU. Gõ sai `todo.contnt` là bị gạch đỏ ngay lúc viết code, chứ
 *      không phải chờ tới lúc chạy mới lòi ra `undefined`.
 *   2. TỰ CHỐNG SQL INJECTION. Prisma luôn tách dữ liệu khỏi câu lệnh, nên kể cả
 *      khi người dùng gõ nội dung todo là `'; DROP TABLE "Todo"; --` thì đó vẫn
 *      chỉ là một chuỗi văn bản vô hại được lưu vào cột content.
 *   3. QUẢN LÝ THAY ĐỔI CẤU TRÚC BẢNG bằng migration (xem `prisma/migrations/`).
 *
 * ---------------------------------------------------------------------------
 * PHÉP MÀU CỦA PRISMA ĐẾN TỪ ĐÂU? — LỆNH `prisma generate`
 * ---------------------------------------------------------------------------
 * Prisma đọc file `prisma/schema.prisma` và SINH RA code TypeScript thật vào
 * trong `node_modules/@prisma/client`. Vì vậy `prisma.todo` tồn tại là do bạn
 * đã khai báo `model Todo` trong schema — nó không phải phép thuật lúc chạy.
 *
 * HỆ QUẢ THỰC TẾ: mỗi lần bạn sửa `schema.prisma`, phải chạy lại
 * `npm run prisma:generate` (hoặc `npm run prisma:migrate`, lệnh này tự chạy
 * generate kèm theo). Không chạy thì TypeScript vẫn nhìn thấy cấu trúc CŨ và
 * báo lỗi khó hiểu kiểu "Property 'xyz' does not exist" — đây là chỗ vấp phổ
 * biến nhất của người mới dùng Prisma.
 */

import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";

/*
 * Hàm nhỏ gom việc tạo lỗi 404 về một chỗ, để câu thông báo luôn giống nhau ở
 * cả bốn nơi dùng tới. Sau này muốn đổi lời văn thì sửa đúng một dòng.
 *
 * Chú ý hàm này TẠO ra lỗi chứ không NÉM lỗi (`return`, không phải `throw`).
 * Nhờ vậy nơi gọi tự quyết định ném lúc nào — và khi đọc `throw notFoundError(id)`
 * thì từ khoá `throw` hiện rõ ngay tại chỗ, dễ theo dõi luồng hơn.
 */
function notFoundError(id: number) {
  return new AppError(404, `Không tìm thấy todo với id ${id}`);
}

/*
 * ============================================================================
 * ⚠️ QUY TẮC SỐ MỘT CỦA FILE NÀY, KỂ TỪ KHI CÓ ĐĂNG NHẬP
 * ============================================================================
 *
 * MỌI hàm bên dưới đều nhận tham số `userId`, và MỌI câu query đều phải có
 * `userId` trong mệnh đề `where`. Không có ngoại lệ.
 *
 * `userId` này là `sub` do middleware `requireAuth` đọc ra TỪ CHỮ KÝ của token
 * Cognito. Client không tự khai được nó.
 *
 * Vì sao phải nhấn mạnh đến thế? Vì đây chính xác là chỗ mà lỗ hổng bảo mật phổ
 * biến nhất thế giới web sinh ra. Nó có tên riêng: IDOR — *Insecure Direct
 * Object Reference*.
 *
 * Kịch bản: An đăng nhập, thấy todo id 5 của mình. An mở DevTools và sửa request
 * thành id 6 — todo của Bình. Nếu câu query chỉ có `where: { id: 6 }` thì server
 * vui vẻ trả về todo của Bình. An không cần kỹ thuật gì cao siêu, chỉ cần đổi
 * một con số.
 *
 * Cách chặn duy nhất là câu query PHẢI hỏi cả hai điều cùng lúc:
 *     "todo id 6, VÀ thuộc về đúng người đang gọi"
 * Không thoả cả hai thì coi như không tồn tại.
 *
 * Chú ý cách ta trả lời khi An hỏi todo của Bình: 404 "không tìm thấy", KHÔNG
 * phải 403 "cấm truy cập". Đây là chủ ý. Trả 403 là vô tình xác nhận "todo id 6
 * CÓ tồn tại, chỉ là không phải của bạn" — một mẩu thông tin nhỏ nhưng đủ để
 * người ta dò ra hệ thống có bao nhiêu bản ghi. Với người dùng, thứ không thuộc
 * về họ thì đơn giản là không tồn tại.
 */

/**
 * Lấy toàn bộ todo CỦA MỘT NGƯỜI DÙNG.
 *
 * `where: { userId }` = `WHERE "userId" = $1`. Đây là dòng biến ứng dụng dùng
 * chung thành ứng dụng riêng tư cho từng người.
 *
 * Nhớ lại `@@index([userId])` đã thêm trong `schema.prisma`: nó tồn tại chính là
 * để phục vụ câu query này, câu chạy nhiều nhất trong cả ứng dụng.
 *
 * `orderBy: { createdAt: "desc" }` = `ORDER BY "createdAt" DESC` — mới nhất lên
 * đầu. Việc sắp xếp được giao cho DATABASE chứ không phải cho JavaScript, vì
 * database có chỉ mục và làm việc này nhanh hơn nhiều; hơn nữa khi dữ liệu lớn
 * tới mức phải phân trang, sắp xếp ở JS sẽ cho kết quả sai hoàn toàn.
 *
 * Hàm này không có `try/catch`: nếu database sập thì lỗi cứ để nó lan lên trên,
 * `errorHandler` sẽ ghi log và trả 500. Chỉ nên bắt lỗi khi bạn THỰC SỰ làm được
 * điều gì đó với nó — bắt rồi ném lại y nguyên chỉ làm code rối thêm.
 */
export async function getAllTodos(userId: string) {
  return prisma.todo.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Lấy một todo theo id — nhưng chỉ khi nó thuộc về `userId`.
 *
 * Chú ý ta dùng `findFirst` chứ KHÔNG phải `findUnique` như bản trước khi có
 * đăng nhập. Đây là một hạn chế thật của Prisma đáng nhớ:
 *
 *   `findUnique` chỉ nhận điều kiện trên các cột DUY NHẤT (khoá chính hoặc cột
 *   `@unique`). `userId` không duy nhất — một người có nhiều todo — nên nó không
 *   được phép xuất hiện trong `where` của `findUnique`.
 *
 *   `findFirst` nhận điều kiện tuỳ ý và trả về bản ghi khớp đầu tiên (hoặc null).
 *
 * Về hiệu năng thì không đáng lo: `id` vẫn là khoá chính nên Postgres tìm bằng
 * chỉ mục, chỉ thêm một phép so sánh `userId` trên đúng dòng đó.
 *
 * Đây cũng là chỗ chặn IDOR đã nói ở trên: An hỏi todo của Bình thì `findFirst`
 * trả `null`, và ta ném 404 y như khi todo không tồn tại thật.
 */
export async function getTodoById(id: number, userId: string) {
  const todo = await prisma.todo.findFirst({ where: { id, userId } });

  if (!todo) {
    throw notFoundError(id);
  }

  return todo;
}

/**
 * Tạo todo mới cho một người dùng.
 *
 * Điểm mấu chốt về bảo mật: `userId` KHÔNG đến từ body request. Nó được
 * controller lấy từ `req.user.sub` — tức là từ token đã ký. Nếu để client tự gửi
 * `userId` lên, ai cũng có thể tạo todo mang tên người khác.
 *
 * Các trường còn lại được điền tự động theo khai báo trong `schema.prisma`:
 *   id        `@default(autoincrement())` → Postgres tự cấp số tăng dần
 *   isDone    `@default(false)`           → mặc định chưa xong
 *   createdAt `@default(now())`           → thời điểm hiện tại
 *   updatedAt `@updatedAt`                → Prisma tự set mỗi lần ghi
 */
export async function createTodo(content: string, userId: string) {
  return prisma.todo.create({ data: { content, userId } });
}

/*
 * ----------------------------------------------------------------------------
 * VÌ SAO BA HÀM SỬA/XOÁ DƯỚI ĐÂY DÙNG `deleteMany` / `updateMany`?
 * ----------------------------------------------------------------------------
 *
 * Đây là chi tiết kỹ thuật quan trọng nhất của cả file, đáng đọc kỹ.
 *
 * Prisma bắt `delete` và `update` (số ít) phải có `where` trỏ tới một bản ghi
 * DUY NHẤT — nghĩa là chỉ được dùng khoá chính hoặc cột `@unique`. Ta không nhét
 * `userId` vào đó được, y như trường hợp `findUnique` ở trên.
 *
 * Cách làm SAI mà rất nhiều người chọn vì nó trông tự nhiên:
 *
 *     const todo = await prisma.todo.findFirst({ where: { id, userId } });
 *     if (!todo) throw notFoundError(id);
 *     return prisma.todo.delete({ where: { id } });   // ⚠️
 *
 * Nó chạy đúng trong hầu hết trường hợp, nhưng có một lỗ hổng tinh vi: giữa hai
 * câu query đó có một KHOẢNG TRỐNG THỜI GIAN. Trong khoảng đó dữ liệu có thể đã
 * đổi, và câu `delete` cuối cùng thì xoá theo `id` mà KHÔNG kiểm tra chủ sở hữu
 * nữa. Loại lỗi này gọi là "race condition" (tranh chấp thời gian) hay TOCTOU —
 * *Time Of Check to Time Of Use*: kiểm tra một đằng, hành động một nẻo.
 *
 * Cách làm ĐÚNG là dùng `deleteMany` / `updateMany`. Chúng nhận điều kiện tuỳ ý,
 * nên `id` và `userId` được kiểm tra NGAY TRONG câu SQL — kiểm tra và hành động
 * gộp làm một thao tác nguyên tử, không còn khoảng trống nào để chen vào:
 *
 *     DELETE FROM "Todo" WHERE id = $1 AND "userId" = $2
 *
 * Đánh đổi: `...Many` trả về `{ count: số dòng bị ảnh hưởng }` chứ không trả về
 * bản ghi. Nên ta phải:
 *   - `count === 0` → không có dòng nào khớp → ném 404
 *   - `count === 1` → xong, rồi đọc lại bản ghi nếu cần trả về cho client
 *
 * Ba hàm dưới đây theo đúng khuôn đó.
 *
 * (Ghi chú thêm: bản trước khi có đăng nhập phải bọc `try/catch` để bắt mã lỗi
 * "P2025" — lỗi Prisma ném ra khi `update`/`delete` không tìm thấy bản ghi. Nay
 * `...Many` không ném lỗi đó nữa mà chỉ trả `count: 0`, nên toàn bộ đám
 * `try/catch` ấy đã được gỡ bỏ. Code vừa ngắn hơn vừa an toàn hơn — một trong
 * những lần hiếm hoi hai thứ đó đi cùng nhau.)
 */

/**
 * Xoá todo — chỉ khi nó thuộc về `userId`.
 *
 * `deleteMany` nghe như xoá nhiều dòng, nhưng vì `id` là khoá chính nên điều kiện
 * này khớp tối đa MỘT dòng. Ta chọn nó vì cần lọc thêm `userId`, không phải vì
 * muốn xoá hàng loạt.
 */
export async function deleteTodo(id: number, userId: string) {
  const result = await prisma.todo.deleteMany({ where: { id, userId } });

  if (result.count === 0) {
    // Không tồn tại, HOẶC tồn tại nhưng của người khác — với người gọi thì như nhau.
    throw notFoundError(id);
  }
}

/**
 * Sửa nội dung todo — chỉ khi nó thuộc về `userId`.
 *
 * Prisma chỉ ghi đè đúng các trường liệt kê trong `data`; `isDone` và `createdAt`
 * giữ nguyên. Còn `updatedAt` được cập nhật TỰ ĐỘNG nhờ `@updatedAt` trong
 * schema — bạn không phải nhớ set nó bằng tay ở từng chỗ.
 *
 * Sau khi `updateMany` xong, ta đọc lại bản ghi để trả về cho frontend. Lần đọc
 * thêm này an toàn: tới đây đã biết chắc dòng đó tồn tại và thuộc về đúng người.
 */
export async function updateTodoContent(id: number, content: string, userId: string) {
  const result = await prisma.todo.updateMany({ where: { id, userId }, data: { content } });

  if (result.count === 0) {
    throw notFoundError(id);
  }

  return getTodoById(id, userId);
}

/**
 * Đánh dấu xong / chưa xong — chỉ khi todo thuộc về `userId`.
 *
 * Một hàm dùng chung cho cả hai chiều thay vì viết `markDone` và `markUndone`
 * riêng: hai việc đó khác nhau đúng một giá trị boolean, tách ra chỉ tạo thêm
 * code lặp.
 */
export async function setTodoDone(id: number, isDone: boolean, userId: string) {
  const result = await prisma.todo.updateMany({ where: { id, userId }, data: { isDone } });

  if (result.count === 0) {
    throw notFoundError(id);
  }

  return getTodoById(id, userId);
}
