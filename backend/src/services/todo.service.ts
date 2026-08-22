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

import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";

/*
 * Prisma đặt tên mã lỗi theo kiểu "P" + số. `P2025` nghĩa là:
 * "An operation failed because it depends on one or more records that were
 * required but not found" — tức là bạn bảo nó sửa/xoá một bản ghi không tồn tại.
 *
 * Tách thành hằng số đặt tên rõ ràng thay vì rải chuỗi `"P2025"` khắp file: đọc
 * code hiểu ngay ý nghĩa, và gõ sai thì TypeScript bắt được.
 */
const PRISMA_NOT_FOUND = "P2025";

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

/**
 * Lấy toàn bộ todo.
 *
 * `findMany` = câu `SELECT * FROM "Todo"`. Không truyền `where` nghĩa là lấy hết.
 *
 * `orderBy: { createdAt: "desc" }` = `ORDER BY "createdAt" DESC` — mới nhất lên
 * đầu. Việc sắp xếp được giao cho DATABASE chứ không phải cho JavaScript, vì
 * database có chỉ mục (index) và làm việc này nhanh hơn nhiều; hơn nữa khi dữ
 * liệu lớn tới mức phải phân trang, sắp xếp ở JS sẽ cho kết quả sai hoàn toàn.
 *
 * Hàm này không có `try/catch`: nếu database sập thì lỗi cứ để nó lan lên trên,
 * `errorHandler` sẽ ghi log và trả 500. Chỉ nên bắt lỗi khi bạn THỰC SỰ làm được
 * điều gì đó với nó — bắt rồi ném lại y nguyên chỉ làm code rối thêm.
 *
 * Để ý hàm có `async` nhưng bên trong không hề `await`: `prisma.todo.findMany()`
 * vốn đã trả về Promise, ta trả thẳng nó ra ngoài và người gọi `await` giúp.
 * Bỏ chữ `async` đi thì code vẫn chạy y hệt; giữ lại chỉ để bảy hàm trong file
 * trông đồng bộ với nhau và để sau này thêm `await` không phải sửa chữ ký hàm.
 */
export async function getAllTodos() {
  return prisma.todo.findMany({ orderBy: { createdAt: "desc" } });
}

/**
 * Lấy một todo theo id.
 *
 * `findUnique` chỉ dùng được với cột có tính duy nhất (khoá chính, hoặc cột
 * đánh dấu `@unique`). Nó trả về `Todo` HOẶC `null` — KHÔNG ném lỗi khi không
 * tìm thấy. Đó là lý do phải tự kiểm tra `if (!todo)` bên dưới.
 *
 * (Prisma cũng có `findUniqueOrThrow` tự ném lỗi, nhưng lỗi đó là lỗi của Prisma
 * chứ không phải `AppError` của mình, nên vẫn phải bắt và dịch lại — viết tay
 * như thế này lại rõ ràng hơn.)
 *
 * Việc ném `AppError(404)` ở đây, thay vì trả `null` về cho controller, giúp mọi
 * controller khỏi phải lặp đi lặp lại đoạn `if (!todo) return res.status(404)...`.
 * Quy ước của dự án: service ném lỗi, controller chỉ lo chuyện thành công.
 */
export async function getTodoById(id: number) {
  const todo = await prisma.todo.findUnique({ where: { id } });

  if (!todo) {
    throw notFoundError(id);
  }

  return todo;
}

/**
 * Tạo todo mới.
 *
 * Chỉ cần đưa `content`. Ba trường còn lại được điền tự động, và điều đó được
 * quy định trong `prisma/schema.prisma`:
 *   id        `@default(autoincrement())` → Postgres tự cấp số tăng dần
 *   isDone    `@default(false)`           → mặc định chưa xong
 *   createdAt `@default(now())`           → thời điểm hiện tại
 *   updatedAt `@updatedAt`                → Prisma tự set mỗi lần ghi
 *
 * `create` trả về bản ghi ĐẦY ĐỦ vừa được tạo (kèm `id` thật do database cấp).
 * Nhờ vậy controller gửi thẳng về cho frontend, frontend có ngay id để hiển thị
 * mà không phải gọi thêm một request nữa.
 */
export async function createTodo(content: string) {
  return prisma.todo.create({ data: { content } });
}

/**
 * Xoá todo.
 *
 * Khác với `findUnique`, hàm `delete` NÉM LỖI khi không tìm thấy bản ghi — lỗi
 * `PrismaClientKnownRequestError` với `code === "P2025"`. Đây là lý do phải có
 * `try/catch` ở đây mà `getAllTodos` thì không cần.
 *
 * Đoạn `catch` làm đúng một việc: DỊCH lỗi kỹ thuật của Prisma sang lỗi nghiệp
 * vụ của mình. Cách làm này giữ cho tầng trên hoàn toàn "mù" về Prisma — đổi
 * ORM thì chỉ file này phải sửa.
 *
 * Hai chi tiết nhỏ nhưng quan trọng:
 *
 *   - `err instanceof Prisma.PrismaClientKnownRequestError` phải kiểm tra TRƯỚC
 *     khi đọc `err.code`. Trong TypeScript, biến trong `catch` có kiểu `unknown`
 *     (vì JavaScript cho phép `throw` bất cứ thứ gì, kể cả một con số). Chỉ sau
 *     khi `instanceof` xác nhận, TypeScript mới cho phép truy cập `.code`.
 *
 *   - `throw err;` ở cuối rất quan trọng. Nếu lỗi KHÔNG phải "không tìm thấy"
 *     (mất kết nối database, hết bộ nhớ...) thì ta ném lại nguyên vẹn để tầng
 *     trên xử lý. Nuốt lỗi im lặng ở đây sẽ khiến bug ẩn mình rất lâu.
 *
 *   - `return await` (thay vì `return` trần) là cố ý: phải `await` NGAY TRONG
 *     khối `try` thì `catch` mới bắt được lỗi. Viết `return prisma.todo.delete(...)`
 *     thì hàm trả Promise ra ngoài rồi mới lỗi — lúc đó `try/catch` này đã kết
 *     thúc, không bắt được gì cả. Đây là cái bẫy rất tinh vi, hãy nhớ kỹ.
 */
export async function deleteTodo(id: number) {
  try {
    return await prisma.todo.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === PRISMA_NOT_FOUND) {
      throw notFoundError(id);
    }
    throw err;
  }
}

/**
 * Sửa nội dung todo.
 *
 * `update` cần hai phần: `where` (tìm bản ghi nào) và `data` (đổi những gì).
 * Prisma chỉ ghi đè đúng các trường bạn liệt kê trong `data`; `isDone` và
 * `createdAt` giữ nguyên.
 *
 * `updatedAt` thì được cập nhật TỰ ĐỘNG nhờ `@updatedAt` trong schema — bạn
 * không phải nhớ set nó bằng tay ở từng chỗ.
 *
 * Phần `catch` giống hệt `deleteTodo`, vì `update` cũng ném P2025 khi không tìm
 * thấy bản ghi.
 */
export async function updateTodoContent(id: number, content: string) {
  try {
    return await prisma.todo.update({ where: { id }, data: { content } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === PRISMA_NOT_FOUND) {
      throw notFoundError(id);
    }
    throw err;
  }
}

/**
 * Bật/tắt trạng thái hoàn thành.
 *
 * Một hàm phục vụ cả hai route `/done` và `/undone` — chỉ khác giá trị tham số
 * `isDone`. Đây là ví dụ nhỏ nhưng điển hình cho việc tách tầng: URL thiết kế
 * thế nào là chuyện của tầng HTTP, còn nghiệp vụ chỉ có duy nhất một thao tác
 * "đặt trạng thái".
 *
 * Lưu ý là hàm NHẬN VÀO giá trị mới chứ không tự đảo (`isDone: !isDone`). Tự đảo
 * sẽ phải đọc bản ghi ra trước rồi mới ghi lại — hai lần chạm database, và nếu
 * hai người bấm cùng lúc thì kết quả cuối cùng khó đoán. Nhận thẳng giá trị mong
 * muốn là cách vừa nhanh vừa an toàn hơn.
 */
export async function setTodoDone(id: number, isDone: boolean) {
  try {
    return await prisma.todo.update({ where: { id }, data: { isDone } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === PRISMA_NOT_FOUND) {
      throw notFoundError(id);
    }
    throw err;
  }
}
