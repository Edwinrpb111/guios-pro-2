import { VERSION_METODO } from './index';

describe('guios-core', () => {
  it('expone la versión del método', () => {
    expect(VERSION_METODO).toBe('GUIOS 2022');
  });
});
