import { withDevPanel } from "next-fetch-panel/middleware";

const { middleware: proxy } = withDevPanel();
export { proxy };

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
