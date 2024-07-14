import * as portfolio from 'codefolio';
import path from 'path';
import {globby} from 'globby';

export default async (projectsLocation) => {
  const pattern = path.join(projectsLocation, "*", "README.md");

  console.log("Searching for projects using `%s`...", pattern);

  const projectReadmes = await globby(pattern);
  console.log("Projects found:", projectReadmes);

  const promisedPortfolios = projectReadmes
    .map(async r => {
      const portfolios = await portfolio.promisePortfolios([r]);
      for (const portfolio of portfolios) {
        const portfolioImage = portfolio.image;
        const portfolioDir = path.dirname(r);
        if (portfolioImage) {
          portfolioImage.url = path.join(portfolioDir, portfolioImage.url);
        }

        for (const example of portfolio.examples) {
          example.url = path.join(portfolioDir, example.url);
        }

        const additionalExamples = await globby(path.join(portfolioDir, "examples", "*.{png,svg}"));

        portfolio.examples = portfolio.examples.concat(additionalExamples.map(p => {
          return {
            url: p
          }
        }));
      }

      return portfolios;
    });

  const portfolios = await Promise.all(promisedPortfolios);
  return portfolios.flatMap(p => p);
};