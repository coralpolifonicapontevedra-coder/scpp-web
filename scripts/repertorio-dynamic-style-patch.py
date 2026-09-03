from pathlib import Path

path = Path('src/components/AdministracionNav.astro')
text = path.read_text(encoding='utf-8')
marker = 'REPERTORIO_DYNAMIC_GLOBAL_STYLE'
if marker in text:
    print('Xa aplicado.')
    raise SystemExit(0)

css = r'''

<style is:global>
  /* REPERTORIO_DYNAMIC_GLOBAL_STYLE
     Detalle e edición son xerados con JavaScript; estes estilos globais
     quedan limitados aos IDs exclusivos desta pantalla. */
  #edit-dialog {
    width: min(780px, calc(100vw - 2rem));
    padding: 0;
    border: 1px solid #d8d0ca;
    border-radius: 6px;
    background: #fff;
    box-shadow: 0 26px 80px rgb(0 0 0 / 22%);
  }
  #edit-dialog::backdrop { background: rgb(0 0 0 / 35%); }
  #edit-dialog form { display: grid; gap: 0; padding: 0; }
  #edit-dialog form > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.2rem 1.3rem;
    border-bottom: 1px solid #e6dfda;
    background: #fff;
  }
  #edit-dialog form > header h2 { margin: .2rem 0; color: #6f1d2b; }
  #edit-dialog .edit-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem 1.1rem;
    padding: 1.25rem 1.3rem;
    background: #fbfaf9;
  }
  #edit-dialog .edit-fields label {
    display: grid;
    align-content: start;
    gap: .4rem;
    min-width: 0;
  }
  #edit-dialog .edit-fields label.wide { grid-column: 1 / -1; }
  #edit-dialog .edit-fields label span {
    color: #5d534e;
    font-size: .74rem;
    font-weight: 800;
  }
  #edit-dialog .edit-fields input,
  #edit-dialog .edit-fields select,
  #edit-dialog .edit-fields textarea {
    width: 100%;
    min-height: 2.7rem;
    box-sizing: border-box;
    padding: .72rem .8rem;
    border: 1px solid #d7cec8;
    border-radius: 3px;
    background: #fff;
    font: inherit;
    color: #302a27;
  }
  #edit-dialog .edit-fields textarea {
    min-height: 6rem;
    resize: vertical;
  }
  #edit-dialog .status {
    min-height: 1.2rem;
    margin: 0;
    padding: .75rem 1.3rem 0;
    color: #7d2939;
  }
  #edit-dialog form > footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 1rem;
    padding: 1rem 1.3rem;
    border-top: 1px solid #e6dfda;
    background: #fff;
  }
  #edit-dialog .primary,
  #edit-dialog .secondary {
    min-height: 2.45rem;
    padding: .65rem .95rem;
    font: inherit;
    font-weight: 750;
    cursor: pointer;
  }
  #edit-dialog .primary {
    border: 1px solid #6f1d2b;
    background: #6f1d2b;
    color: #fff;
  }
  #edit-dialog .secondary {
    border: 1px solid #cbc1ba;
    background: #fff;
    color: #3f3935;
  }

  #detail.detail.card {
    max-width: 900px;
    overflow: hidden;
    border: 1px solid #dfd8d2;
    border-radius: 6px;
    background: #fff;
    box-shadow: none;
  }
  #detail .detail-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.25rem 1.35rem;
    border-bottom: 1px solid #e5dfda;
    background: #fff;
  }
  #detail .detail-head h2 {
    margin: .2rem 0 .35rem;
    color: #6f1d2b;
    font-size: clamp(1.5rem, 2.5vw, 2rem);
  }
  #detail .detail-head p { margin: 0; color: #71665f; }
  #detail .head-actions { display: flex; align-items: center; gap: .65rem; }
  #detail .detail-sections {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    padding: 1.25rem 1.35rem;
    border-bottom: 0;
    background: #fbfaf9;
  }
  #detail .detail-group,
  #detail .detail-group:nth-child(even) {
    min-width: 0;
    padding: 1rem;
    border: 1px solid #ded6d0;
    border-radius: 5px;
    background: #fff;
  }
  #detail .detail-group:last-child:nth-child(odd) { grid-column: 1 / -1; }
  #detail .detail-group h3 {
    margin: 0 0 .85rem;
    padding-bottom: .55rem;
    border-bottom: 1px solid #eee7e2;
    color: #6f1d2b;
    font-size: .92rem;
  }
  #detail .detail-group dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: .8rem;
    margin: 0;
  }
  #detail .detail-group dl div {
    display: grid;
    grid-template-columns: 1fr;
    gap: .35rem;
    min-width: 0;
  }
  #detail .detail-group dl div:only-child { grid-column: 1 / -1; }
  #detail .detail-group dt,
  #detail .technical dt {
    color: #5d534e;
    font-size: .74rem;
    font-weight: 800;
  }
  #detail .detail-group dd {
    min-height: 2.45rem;
    box-sizing: border-box;
    margin: 0;
    padding: .7rem .78rem;
    border: 1px solid #d7cec8;
    border-radius: 3px;
    background: #fff;
    color: #302a27;
    font-weight: 500;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  #detail .technical {
    margin: 0 1.35rem 1.15rem;
    border: 1px solid #e7e0db;
    border-radius: 4px;
    background: #fbf9f7;
  }
  #detail .technical summary {
    padding: .8rem 1rem;
    cursor: pointer;
    font-weight: 750;
    color: #635953;
  }
  #detail .technical > div { padding: 0 1rem 1rem; }
  #detail > footer {
    display: flex;
    justify-content: flex-end;
    padding: 1rem 1.35rem 1.25rem;
    border-top: 1px solid #eee7e2;
    background: #fff;
  }

  @media (max-width: 900px) {
    #edit-dialog .edit-fields,
    #detail .detail-sections,
    #detail .detail-group dl { grid-template-columns: 1fr; }
    #edit-dialog .edit-fields label.wide,
    #detail .detail-group:last-child:nth-child(odd),
    #detail .detail-group dl div:only-child { grid-column: auto; }
    #detail.detail.card { max-width: none; }
    #detail .detail-head { display: grid; }
  }
</style>
'''

path.write_text(text + css, encoding='utf-8')
print('Parche aplicado.')
