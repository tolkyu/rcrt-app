const { items } = pm.response.json();
const gambling = pm.collectionVariables.get('position_gambling_vertical_id');
pm.test('Head Recruiter manages only Гемблінг, with counts', () => {
  pm.expect(items.length).to.be.above(0);
  items.forEach((p) => {
    pm.expect(p.verticalId).to.equal(gambling);
    pm.expect(p.openVacanciesCount).to.be.a('number');
  });
});
