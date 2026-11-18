const vacancy = pm.response.json();
pm.collectionVariables.set('vacancy_content_id', vacancy.id);
pm.collectionVariables.set('vacancy_content_version', vacancy.version);
pm.test('the content fixture is published', () => {
  pm.expect(vacancy.status).to.equal('OPEN');
});
