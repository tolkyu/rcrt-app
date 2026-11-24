const draft = pm.response.json();
pm.test('the author sees the draft', () => {
  pm.expect(draft.id).to.equal(pm.collectionVariables.get('vacancy_draft_id'));
  pm.expect(draft.status).to.equal('DRAFT');
});
