"""Install DuckDB's signed HTTP extension for the container build."""
import gzip
import os
from pathlib import Path
from shutil import copyfileobj
from urllib.request import Request, urlopen

import duckdb


def main():
    directory = Path(os.environ["EMBERGRID_DUCKDB_EXTENSION_DIRECTORY"])
    version = f"v{duckdb.__version__}"
    with duckdb.connect(config={"extension_directory": str(directory)}) as connection:
        platform = connection.execute("PRAGMA platform").fetchone()[0]
        extension = directory / version / platform / "httpfs.duckdb_extension"
        extension.parent.mkdir(parents=True, exist_ok=True)
        url = f"https://extensions.duckdb.org/{version}/{platform}/{extension.name}.gz"
        request = Request(url, headers={"User-Agent": f"DuckDB/{version}"})
        with urlopen(request, timeout=30) as response, gzip.GzipFile(fileobj=response) as compressed:
            with extension.open("wb") as output:
                copyfileobj(compressed, output)
        connection.execute("LOAD httpfs")


if __name__ == "__main__":
    main()
