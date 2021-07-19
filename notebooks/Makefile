legislation: ../dist/legislation.json Bill.ipynb ma_committees.json ma_legislative_members.json
	python3 update_legislation.py
.PHONY: legislation

../dist/legislation.json: ACLUM\ Legislation.ipynb
ma_committees.json: Committees.ipynb
ma_legislative_members.json: LegislativeMembers.ipynb
ma_bills.json: Documents.ipynb
ma_hearings.json: Hearings.ipynb

%.json:
	jupyter nbconvert --to notebook --inplace --execute "$<"
	touch $@

clean:
	rm -f *.json
.PHONY: clean
