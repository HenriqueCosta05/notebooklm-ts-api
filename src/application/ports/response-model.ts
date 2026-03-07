export interface ResponseModel<T> {
  statusCode: number;
  messages: string[];
  body: T;
}
