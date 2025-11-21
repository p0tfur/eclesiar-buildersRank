declare module "express" {
  // Minimal shim for build-time only
  export type Request = any;
  export type Response = any;
  export type NextFunction = (...args: any[]) => any;

  const e: any;
  export default e;
}

declare module "cors" {
  const c: any;
  export default c;
}
