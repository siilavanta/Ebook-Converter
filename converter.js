
async function unzipFile(dir) {
    let unzipedText = ''
    // read zipfile data
    try {
      const response = await fetch(dir);
      const zipData = await response.blob();
      const zipContent = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(zipData);
      });

      //unzip files
      const uzip = await JSZip.loadAsync(zipContent);

      //Iterate files
      for (const [relativePath, zipEntry] of Object.entries(uzip.files)) {
        if (!zipEntry.dir) {
          const fileData = await zipEntry.async('uint8array');
          const fileName = zipEntry.name;
          const fileExtension = fileName.substring(fileName.lastIndexOf('.') + 1);

          // console.log('File:', fileName);


          if (fileExtension === 'html') {
            const blob = new Blob([fileData]);
            let htmlString = await blob.text();

            // Handle HTML file data here

            // Replace all '&nbsp;' to ' '
            const htmlSpaceRegExp = /&nbsp;/g;
            htmlString = htmlString.replace(htmlSpaceRegExp, ' ')
            //Use regular expression to extract the title content
            const titleRegex = /<title\b[^>]*>([\s\S]*?)<\/title>/;
            const matchTitle = titleRegex.exec(htmlString);
            const titleContent = matchTitle ? matchTitle[1] : '';
            //console.log(titleContent)

            // Use regular expression to extract the body content
            const bodyRegex = /<body\b[^>]*>([\s\S]*?)<\/body>/;
            const match = bodyRegex.exec(htmlString);
            const bodyContent = match ? match[1] : '';

            unzipedText += bodyContent

            const emptyLineRegExp = /\n\n/g
            unzipedText = unzipedText.replace(emptyLineRegExp, '\n')


          } else if (fileExtension === 'ncx') {

            //Just testing for Table of content level fixing
            const blob = new Blob([fileData]);
            const txt = await blob.text();
            // Handle NCX file data here
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(txt, 'text/xml');

            const navs = xmlDoc.querySelectorAll('navMap > navPoint');

            //  console.log(navs)
            // Level 1
            //     for (const nav of navs) {
            //         const text = nav.querySelector('text').textContent;
            //         const contentSrc = nav.querySelector('content').getAttribute('src');
            //         console.log('Level 1 - Text:', text);
            //         console.log('Level 1 - Content src:', contentSrc);

            //         // Level 2
            //         const navs2 = nav.querySelectorAll('navPoint');
            //         for (const nav2 of navs2) {
            //             const text2 = nav2.querySelector('text').textContent;
            //             const contentSrc2 = nav2.querySelector('content').getAttribute('src');
            //             console.log('Level 2 - Text:', text2);
            //             console.log('Level 2 - Content src:', contentSrc2);

            //             // Level 3
            //             const navs3 = nav2.querySelectorAll('navPoint');
            //             for (const nav3 of navs3) {
            //                 const text3 = nav3.querySelector('text').textContent;
            //                 const contentSrc3 = nav3.querySelector('content').getAttribute('src');
            //                 console.log('Level 3 - Text:', text3);
            //                 console.log('Level 3 - Content src:', contentSrc3);
            //             }
            //         }
            //     }
            // 
          }
        }
      }

    } catch (error) {
      console.error('Error unzipping file:', error);
    }

    // finally return html content
    return unzipedText
  }


  async function makeSqlData() {


    let title = '';
    let basketName = '';
    let categoryID = '';
    let categoryName = '';
    let bookName = '';
    let bookID = '';
    let pagesSql = '';
    let categorySql = '';
    let booksSql = '';
    let deletesSql = '';

    //Load bookList data
    let bookListData = await fetch("./booklist.json")
    const bookList = await bookListData.json();

    //Iterate the bookList
    for (let i = 0; i < bookList.length; i++) {
      const dir = bookList[i].dir;

      //Retrieve text from epub ebook via unziped
      let unzipedText = await unzipFile(dir);
      // console.log(unzipedText)

      title = bookList[i].title;
      basketName = bookList[i].basketName;
      categoryID = bookList[i].categoryID;
      categoryName = bookList[i].categoryName;
      bookName = bookList[i].bookName;
      bookID = bookList[i].bookID;

      let totalPageNum = 0;
      let getPageSql;
      // delete the info
      deletesSql += "Begin Transaction;\n";
      deletesSql += `DELETE from tocs where book_id = '${bookID}';\n`;
      deletesSql += `DELETE from books where id = '${bookID}';\n`;
      deletesSql += `DELETE from pages where bookid = '${bookID}';\n`;
      deletesSql += `DELETE from fts_pages where bookid = '${bookID}';\n`;
      deletesSql += `DELETE from category where id = '${categoryID}';\n`;
      deletesSql += "COMMIT;\n";

      // do another trans
      pagesSql += "Begin Transaction;\n";

      const lines = unzipedText.split('\n');
      let lineLimit = 35;
      
      getPageSql = pageGenerator(lines, bookID);
      pagesSql = getPageSql.pagesSql;
      totalPageNum = getPageSql.totalPageNum

      categorySql += `INSERT INTO category (id, name, basket) Select '${categoryID}', '${categoryName}', '${basketName}' WHERE NOT EXISTS(SELECT 1 FROM category WHERE id = '${categoryID}');\n`;

      booksSql += `INSERT INTO books (id, basket, category, name, firstpage, lastpage, pagecount) VALUES ('${bookID}', '${basketName}', '${categoryID}', '${bookName}', 1, ${totalPageNum}, ${totalPageNum});\n`;

      pagesSql += "COMMIT;\n";


    }

    const categoryAndBooks = `Begin Transaction;\n${categorySql}${booksSql}\nCOMMIT;\n`;
    const content = `${deletesSql}${categoryAndBooks}${pagesSql}`;


    var blob = new Blob([content], { type: "application/sql" });
    var url = URL.createObjectURL(blob);

    // Trigger file download
    var link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", bookName + ".sql");
    link.click();
    //console.log(content)
  }

 
  function pageGenerator(lines, bookID) {
    let pageNum = 1;
    let sb = '';
    let pagesSql = '';
    let linesPerPage = 0;
    let titleLine = ''
    let div = document.createElement('div')

    for (let k = 0; k < lines.length; k++) {
      let line = lines[k].replace(/'/g, "''");
      line = line.replace(/<br\/>/g, " ");
      //console.log(line)

      linesPerPage++;

      if (line.includes('</h')) {

        div.innerHTML = line;
        titleLine = div.textContent.replace('\n', ' ');
        if (line.includes('</h1>')) {
          line = `<h1>${titleLine}</h1>`
          //alert('hh')
        } else if (line.includes('</h2>')) {
          line = `<h2>${titleLine}</h2>`
        } else if (line.includes('</h3>')) {
          line = `<h3>${titleLine}</h3>`

        } else if (line.includes('</h4>')) {
          line = `<h4>${titleLine}</h4>`
        }

        pagesSql += `INSERT INTO tocs (book_id, name, type, page_number) VALUES ('${bookID}', '${titleLine}', 'title', ${pageNum});\n`;
      } else {
        // handle p and other tags
        line = div.textContent
      }

      sb += `<p>${line}</p>`;
      sb = sb.replace('\n', ' ')
      if (linesPerPage > 35) {
        pagesSql += `INSERT INTO pages (bookid, page, content, paranum) VALUES ('${bookID}', ${pageNum}, '${sb}', '-${pageNum}-');\n`;
        linesPerPage = 0;
        pageNum++;
        sb = '';
      }
    }

    // there are remainder items.. like half page remaining.
    if (sb !== '') {
      pagesSql += `INSERT INTO pages (bookid, page, content, paranum) VALUES ('${bookID}', ${pageNum}, '${sb}', '-${pageNum}-');\n`;
      linesPerPage = 0;
      pageNum++;
      sb = '';
    }

    // return an Object {pagesSql, totalPageNum}
    return {
      pagesSql: pagesSql,
      totalPageNum: pageNum
    };
  }



  async function showBookList(){
    let bookListData = await fetch("./booklist.json")
    const bookList = await bookListData.json();
    const book_names = document.getElementById('book_names')
    let bookNames = []
    bookList.forEach(element => {
      bookNames.push(`<li>${element.bookName}</li>`)
    });

    book_names.innerHTML = bookNames.join(' ')

  }

  showBookList()