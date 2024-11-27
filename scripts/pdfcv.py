from markdown import markdown
from weasyprint import HTML, CSS
from pathlib import Path
import tempfile
from jinja2 import Template
import sys

def split_front_matter(content):
    """
    Split front matter and content if exists.

    :param content: Markdown content.
    :return: Front matter and content.
    """
    if content.startswith('+++'):
        _, _, content = content.split('+++', 2)
        return content
    return content

def convert_cv_to_pdf(statement_file, cv_file, template_file, output_pdf, lines_to_remove=[], css_file=None):
    """
    Convert a Markdown CV to PDF with optional CSS styling.

    :param statement_file: Path to the statement file.
    :param cv_file: Path to the CV file.
    :param template_file: Path to the Jinja2 template file.
    :param lines_to_remove: List of lines to remove from the content.
    :param output_pdf: Path to the output PDF file.
    """
    # Combine statement and CV markdown files
    content =  "# Matt Hazley\n\n### hello@matthazley.com | (+44) 07743453747\n\n"
    with open(statement_file, 'r', encoding='utf-8') as f:
        statement = f.read()
        statement = split_front_matter(statement)
        with open(cv_file, 'r', encoding='utf-8') as f:
            cv = f.read()
            cv = split_front_matter(cv)
            content = content + statement + cv

    # Remove lines from content
    for line in lines_to_remove:
        content = content.replace(line, '')

    # Convert markdown to HTML
    html_content = markdown(content, extensions=['tables', 'fenced_code'])

    # Read template
    with open(template_file, 'r', encoding='utf-8') as f:
        template_content = f.read()

    # Render template
    template = Template(template_content)
    html_output = template.render(
        content=html_content,
        title='Curriculum Vitae'
    )

    # Create temporary HTML file
    with tempfile.NamedTemporaryFile(suffix='.html', mode='w', encoding='utf-8', delete=False) as temp:
        temp.write(html_output)
        temp_path = temp.name

    # Configure WeasyPrint with custom CSS if provided
    css = None
    if css_file:
        css = CSS(filename=css_file)

    # Convert HTML to PDF
    HTML(temp_path).write_pdf(output_pdf, stylesheets=[css] if css else None)

    # Clean up temporary file
    Path(temp_path).unlink()


if __name__ == '__main__':
    # Example usage
    convert_cv_to_pdf(
        statement_file='../content/_index.md',
        cv_file='../content/cv.md',
        template_file='cvtemplate.html',
        output_pdf='cv.pdf',
        lines_to_remove = [
            "# Hi, I'm Matt 👋",
            "[Reach out](mailto:hello@matthazley.com) if you'd like to chat, or find me",
            "on [LinkedIn](https://www.linkedin.com/in/matthazley/)."
        ]
    )