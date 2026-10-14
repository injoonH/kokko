import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { routeTree } from "./routeTree.gen";
import "./styles.css";
export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPendingComponent: () => (
    <p className="p-8" role="status">
      불러오는 중…
    </p>
  ),
  defaultErrorComponent: ({ error, reset }) => (
    <div className="panel m-6">
      <h1 className="text-xl font-bold">화면을 불러오지 못했어요</h1>
      <p className="my-4">
        {error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요."}
      </p>
      <button
        type="button"
        className="action bg-primary text-white"
        onClick={reset}
      >
        다시 시도
      </button>
    </div>
  ),
  defaultNotFoundComponent: () => (
    <div className="panel m-6">
      페이지를 찾을 수 없습니다. <a href="/">홈으로</a>
    </div>
  ),
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
