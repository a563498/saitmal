import argparse, sqlite3
from pathlib import Path

def main():
  ap = argparse.ArgumentParser()
  ap.add_argument("--db", required=True)
  ap.add_argument("--out", required=True)
  args = ap.parse_args()

  con = sqlite3.connect(args.db)
  cur = con.cursor()

  out = Path(args.out)
  with out.open("w", encoding="utf-8") as f:
    f.write("BEGIN;\n")
    for row in cur.execute("SELECT word,pos,level,definition,example,tokens,rel_tokens FROM entries"):
      # escape single quotes
      vals=[]
      for v in row:
        if v is None:
          vals.append("NULL")
        else:
          s=str(v).replace("'", "''")
          vals.append(f"'{s}'")
      f.write("INSERT INTO entries(word,pos,level,definition,example,tokens,rel_tokens) VALUES (" + ",".join(vals) + ");\n")
    f.write("COMMIT;\n")
  print("wrote", out)

if __name__ == "__main__":
  main()
