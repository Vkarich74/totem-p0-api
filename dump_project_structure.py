# dump_project_structure.py
# FULL LOCAL PROJECT STRUCTURE DUMP
# Dumps full directory tree, file metadata, key file contents (safe types only)
# Root: C:\Users\Vitaly\Desktop\odoo-local
# Output: project_dump\*

import os
import hashlib
from datetime import datetime, timezone

ROOT = r"C:\Users\Vitaly\Desktop\odoo-local"
OUT_DIR = os.path.join(ROOT, "project_dump")

MAX_FILE_SIZE_MB = 5
TEXT_EXTENSIONS = {
    ".ts", ".js", ".json", ".md", ".env",
    ".py", ".yaml", ".yml", ".html", ".xml",
    ".css", ".scss", ".txt"
}

EXCLUDE_DIRS = {
    "node_modules",
    ".git",
    "__pycache__",
    "project_dump"
}

def now():
    return datetime.now(timezone.utc).isoformat()

def file_hash(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(8192)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

def ensure_dir():
    if not os.path.exists(OUT_DIR):
        os.makedirs(OUT_DIR)

def dump_tree():
    tree_path = os.path.join(OUT_DIR, "TREE.txt")
    with open(tree_path, "w", encoding="utf-8") as out:
        for root, dirs, files in os.walk(ROOT):
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            level = root.replace(ROOT, "").count(os.sep)
            indent = " " * 2 * level
            out.write(f"{indent}{os.path.basename(root)}\n")
            subindent = " " * 2 * (level + 1)
            for f in files:
                out.write(f"{subindent}{f}\n")

def dump_file_index():
    index_path = os.path.join(OUT_DIR, "FILES_INDEX.csv")
    with open(index_path, "w", encoding="utf-8") as out:
        out.write("path,size_bytes,sha256\n")
        for root, dirs, files in os.walk(ROOT):
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            for f in files:
                full = os.path.join(root, f)
                try:
                    size = os.path.getsize(full)
                    h = file_hash(full)
                    rel = os.path.relpath(full, ROOT)
                    out.write(f"{rel},{size},{h}\n")
                except:
                    continue

def dump_key_files():
    content_path = os.path.join(OUT_DIR, "KEY_FILES_CONTENT.txt")
    with open(content_path, "w", encoding="utf-8") as out:
        for root, dirs, files in os.walk(ROOT):
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            for f in files:
                full = os.path.join(root, f)
                ext = os.path.splitext(f)[1].lower()
                if ext in TEXT_EXTENSIONS:
                    size_mb = os.path.getsize(full) / (1024 * 1024)
                    if size_mb <= MAX_FILE_SIZE_MB:
                        rel = os.path.relpath(full, ROOT)
                        out.write("\n" + "="*80 + "\n")
                        out.write(f"FILE: {rel}\n")
                        out.write("="*80 + "\n")
                        try:
                            with open(full, "r", encoding="utf-8", errors="ignore") as file_content:
                                out.write(file_content.read())
                        except:
                            out.write("<<READ ERROR>>\n")

def dump_summary():
    summary_path = os.path.join(OUT_DIR, "SUMMARY.txt")
    total_files = 0
    total_dirs = 0

    for root, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        total_dirs += len(dirs)
        total_files += len(files)

    with open(summary_path, "w", encoding="utf-8") as out:
        out.write("PROJECT STRUCTURE DUMP\n")
        out.write(f"Generated: {now()}\n")
        out.write(f"Root: {ROOT}\n")
        out.write(f"Total directories: {total_dirs}\n")
        out.write(f"Total files: {total_files}\n")

def main():
    print("Starting full project dump...")
    ensure_dir()
    dump_tree()
    dump_file_index()
    dump_key_files()
    dump_summary()
    print("DONE.")
    print(f"Dump folder: {OUT_DIR}")

if __name__ == "__main__":
    main()
