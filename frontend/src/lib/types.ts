export type Todo = {
  id: number;
  content: string;
  isDone: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiFailure = {
  success: false;
  message: string;
  errors?: { path: string; message: string }[];
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/** Kết quả trả về cho các form dùng useActionState: null nghĩa là chưa submit lần nào. */
export type FormState = { error: string } | null;
