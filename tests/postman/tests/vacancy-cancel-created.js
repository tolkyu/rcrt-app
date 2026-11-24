const draft = pm.response.json();
pm.test('a draft of the Admin, version 1', () => {
  pm.expect(draft.status).to.equal('DRAFT');
  pm.expect(draft.version).to.equal(1);
});
pm.collectionVariables.set('vacancy_cancel_id', draft.id);
