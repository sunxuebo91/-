"""通用 PDF 文字提取脚本。

用法：python scripts/standards/_extract_pdf.py <pdf路径> <输出txt路径>
"""
import sys
import pdfplumber


def main():
    if len(sys.argv) < 3:
        print("usage: python _extract_pdf.py <pdf> <out_txt>")
        sys.exit(1)
    pdf_path = sys.argv[1]
    out_path = sys.argv[2]
    pieces = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages, 1):
            text = page.extract_text() or ""
            pieces.append(f"\n--- page {i} ---\n{text}")
    full = "\n".join(pieces)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(full)
    print(f"pages={len(pieces)} chars={len(full)}")


if __name__ == "__main__":
    main()
