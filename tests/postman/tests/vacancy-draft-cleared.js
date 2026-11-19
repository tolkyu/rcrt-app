const draft = pm.response.json();
const before = pm.collectionVariables.get('vacancy_draft_version');
pm.test(
  'the optional field is cleared, the others stay, the version moves up by one',
  () => {
    pm.expect(draft.status).to.equal('DRAFT');
    pm.expect(draft.location).to.equal(null);
    pm.expect(draft.headcount).to.equal(2);
    pm.expect(draft.version).to.equal(Number(before) + 1);
  },
);
pm.collectionVariables.set('vacancy_draft_version', draft.version);
