const draft = pm.response.json();
const before = pm.collectionVariables.get('vacancy_draft_version');
pm.test('the merged draft is saved and the version moves up', () => {
  pm.expect(draft.status).to.equal('DRAFT');
  pm.expect(draft.title).to.equal(
    'Тест API — оновлена ' + pm.collectionVariables.get('vacancy_run'),
  );
  pm.expect(draft.headcount).to.equal(2);
  pm.expect(draft.location).to.equal('Київ');
  pm.expect(draft.version).to.equal(Number(before) + 1);
  pm.expect(draft.openedAt).to.equal(null);
});
pm.collectionVariables.set('vacancy_draft_version', draft.version);
