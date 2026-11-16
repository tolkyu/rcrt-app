const { count } = pm.response.json();
pm.test('the author counts at least the new draft', () => {
  pm.expect(count).to.be.at.least(1);
});
pm.collectionVariables.set('vacancy_draft_count', String(count));
