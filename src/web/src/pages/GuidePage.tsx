// The style guide (analysis of the 2020–2024 books). Still the original static page under
// /stijlgids/; it moves into React when it needs editing.
export function GuidePage() {
  return (
    <iframe
      src="/stijlgids/index.html"
      title="Stijlgids"
      className="block w-full border-0"
      style={{ height: "calc(100dvh - 3.5rem)" }}
    />
  );
}
