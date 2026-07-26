export const renderDocument = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Hello world</title>
  </head>
  <body>
    <header class="site-header">
      <nav aria-label="Primary navigation">
        <a href="/">Home</a>
        <a href="/about">About</a>
      </nav>
    </header>
    <main>
      <article>
        <h1>Hello, world!</h1>
        <p>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit.
          Integer posuere erat a ante venenatis dapibus posuere velit aliquet.
        </p>
        <section aria-labelledby="details">
          <h2 id="details">A small HTML document</h2>
          <p data-kind="summary">
            Curabitur blandit tempus porttitor. Maecenas faucibus mollis interdum.
          </p>
          <button type="button">Learn more</button>
        </section>
      </article>
    </main>
    <footer>
      <small>&copy; 2026 Hello World</small>
    </footer>
  </body>
</html>
`
