import json
from pathlib import Path

import papermill as pm
from tqdm import tqdm

input_path = Path("Bill Details.ipynb")
output_dir = Path("tmp")
output_dir.mkdir(exist_ok=True)

with open("../dist/legislation.json") as f:
    legislation_choices = json.load(f)

bills = [bill for legislation in legislation_choices for bill in legislation["bills"]]

for bill in tqdm(bills):
    output_path = (
        output_dir
        / f"{input_path.stem} {bill['session']} {bill['number']}{input_path.suffix}"
    )

    pm.execute_notebook(
        input_path,
        output_path,
        parameters=dict(
            bill_session=bill["session"],
            bill_number=bill["number"],
        ),
        progress_bar=False,
    )
