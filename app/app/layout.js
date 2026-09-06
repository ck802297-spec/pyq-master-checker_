
import "./globals.css";

export const metadata = {
  title: "PYQ Master Checker",
  description: "Previous Year Question Paper Repetition Checker",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
