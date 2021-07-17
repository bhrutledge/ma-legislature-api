import json

import papermill as pm
from tqdm import tqdm

with open("../dist/legislation.json") as f:
    legislation_choices = json.load(f)

bills = [bill for legislation in legislation_choices for bill in legislation["bills"]]

for bill in tqdm(bills):
    pm.execute_notebook(
        "Bill Details.ipynb",
        f"papermill/Bill Details {bill['session']} {bill['number']}.ipynb",
        parameters=dict(
            bill_session=bill["session"],
            bill_number=bill["number"],
        ),
        progress_bar=False,
    )
