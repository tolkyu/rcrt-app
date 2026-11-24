const { items } = pm.response.json();
pm.test('only open Медіабаєр vacancies of the vertical', () => {
  pm.expect(items.length).to.be.above(0);
  items.forEach((v) => {
    pm.expect(v.status).to.equal('OPEN');
    pm.expect(v.title.toLowerCase()).to.include('медіабаєр');
    pm.expect(v.vertical.name).to.equal('Гемблінг');
  });
});
