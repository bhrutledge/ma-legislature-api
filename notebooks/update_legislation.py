import json

import papermill as pm

with open("../dist/legislation.json") as f:
    legislation_choices = json.load(f)

bills = [bill for legislation in legislation_choices for bill in legislation["bills"]]

for bill in bills:
    print(bill)
    pm.execute_notebook(
        "Bill Details.ipynb",
        f"papermill/Bill Details {bill['session']} {bill['number']}.ipynb",
        parameters=dict(bill_number=bill["number"]),
    )
