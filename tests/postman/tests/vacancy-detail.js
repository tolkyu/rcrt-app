const vacancy = pm.response.json();
pm.test('the requested vacancy with its team and terms', () => {
  pm.expect(vacancy.id).to.equal(
    pm.collectionVariables.get('vacancy_gambling_id'),
  );
  pm.expect(vacancy.number).to.match(/^V-\d{4,}$/);
  pm.expect(vacancy.vertical.name).to.equal('Гемблінг');
  pm.expect(vacancy.recruiters).to.be.an('array');
  pm.expect(vacancy.probationDays).to.be.within(30, 90);
  pm.expect(vacancy).to.not.have.property('publicNo');
});
