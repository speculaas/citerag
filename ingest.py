#!/usr/bin/env python
"""CLI: load a PDF into citerag's Chroma store under a given paper_id.

Usage:
    python ingest.py <paper_id> <path-to-pdf>

Example:
    python ingest.py arxiv-2407.04180 ../../../assignments/Slice-100K.pdf
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "server"))
from rag import ingest_pdf, chunk_count


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__.strip())
    paper_id, pdf_path = sys.argv[1], sys.argv[2]
    if not os.path.exists(pdf_path):
        sys.exit(f"PDF not found: {pdf_path}")
    print(f"Embedding {pdf_path} → paper_id={paper_id} ...")
    n = ingest_pdf(paper_id, pdf_path)
    total = chunk_count(paper_id)
    print(f"Added {n} chunks. Total chunks for {paper_id}: {total}")


if __name__ == "__main__":
    main()
