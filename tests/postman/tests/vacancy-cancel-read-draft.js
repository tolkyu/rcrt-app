const draft = pm.response.json();
pm.test('every refused reason left a draft at version 1', () => {
  pm.expect(draft.id).to.equal(pm.collectionVariables.get('vacancy_cancel_id'));
  pm.expect(draft.status).to.equal('DRAFT');
  pm.expect(draft.version).to.equal(1);
});
