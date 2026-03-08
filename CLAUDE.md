# CorollaryCompensation (profile monorepo)

Internal compensation planning tool — a replacement for Pequity.
Covers merit increase planning, bonus planning, and comp band management.

Repo: https://github.com/chrisprusinowski/profile
Deployed: GitHub Pages (36+ deployments)

---

## Monorepo Structure

```
/
├── apps/
│   ├── api/          ← Express + TypeScript backend (Node.js)
│   └── web/          ← Express + TypeScript server
├── merit-bonus/      ← Vanilla HTML/CSS/JS app (current working UI)
│   ├── index.html
│   ├── merit.html
│   ├── employees.html
│   ├── admin.html
│   ├── executive.html
│   ├── import.html
│   ├── css/
│   └── js/
├── packages/         ← Shared packages (roles, auth scaffolding)
├── docs/
├── infra/
│   └── postgres/migrations/
├── docker-compose.yml
├── package.json      ← npm workspaces root (workspaces: ["apps/*"])
├── tsconfig.base.json
└── eslint.config.js
```

---

## Tech Stack

**Root / Tooling**
- npm workspaces (monorepo)
- - TypeScript 5.6
  - - ESLint 9 + Prettier
    - - Vitest (testing)
     
      - **apps/api** — Node.js backend
      - - Express 4, Zod (validation), TypeScript via tsx
       
        - **apps/web** — Express/TypeScript server
        - - Express 4, Zod, tsx, Vitest, Supertest
         
          - **merit-bonus/** — the active comp planning UI
          - - Vanilla HTML + CSS + JS (no framework, no build step)
            - - localStorage for data persistence
              - - CSV import via import.html
                - - Live budget metrics
                 
                  - > Note: There is no Reac#t /CVoirtoel lfarroynCtoemnpde nyseatt.i oTnh e( pwroorfkiilneg  mUoIn oirse pion)
                    > m
                    > eIrnitte-rbnoanlu sc/o mapse npslaatiino nH TpMlLa nfniilnegs .t
                    > o
                    > o-l- -—
                    > a
                    >  #r#e pAlcatcievmee nFte aftourr ePse q(umietryi.t
                    > -Cboovneurss/ )m
                    > e
                    > r-i t* *iEnmcprleoayseee  prloasntneirn*g*,  (beomnpulso ypeleasn.nhitnmgl,)  a— nadd dc/oemdpi tb aenmdp lmoayneaegse,m eCnStV.
                    > i
                    > mRpeoprot:
                    >  -h t*t*pMse:r/i/tg iptlhaunbn.icnogm*/*c h(rmiesrpirtu.shitnmolw)s k— im/eprriotf iilnec
                    > rDeeapsleosy ewdi:t hG isttHautbu sP atgreasc k(i3n6g+
                    >  -d e*p*lAodymmienn*t*s )(
                    > a
                    > d-m-i-n
                    > .
                    > h#t#m lM)o n— otreeapmo- bSatsreudc tmuerrei
                    > t
                    >  `a`n`d
                    >  /b
                    > o├─n─ uasp pbsu/d
                    > g│e t i n├─g─ ,a pfii/n a n c e   m o d u l←e
                    > E-x p*r*eEsxse c+u tTiyvpee Svcireiwp*t*  b(aecxkeecnudt i(vNeo.dhet.mjls))
                    > —│  s u m└─m─ awreyb /d a s h b o a r d
                    >  -←  *E*xCpSrVe sism p+o rTty*p*e S(cirmippotr ts.ehrtvmelr)
                    >  ├─—─  umpelroiatd- beomnpulso/y e e   d a t← aV
                    > a
                    > n-i-l-l
                    > a
                    >  #H#T MDLa/tCaS SL/aJySe ra
                    > p
                    > p-  (Ecmuprlroeynete  wdoartkai nsgt oUrIe)d
                    >  │i n   *├─*─ lioncdaelxS.thotrmalg
                    > e│* *   (├─n─ om ebraictk.ehntdm lp
                    > e│r s i s├─t─ eenmcpel oyyeete)s
                    > .-h tCmSlV
                    >  │i m p o├─r─ ta damviani.lhatbmlle
                    >  │v i a  ├─i─ mepxoerctu.thitvmel.
                    > h-t malp
                    > p│s / a p├─i─  i+m pPoorstt.ghrtemsl
                    > i│n f r a├─s─ tcrsusc/t
                    > u│r e   e└─x─ ijsst/s
                    >  ├b──u tp ancokta gyeest/  w i r e d   t o  ← tShhea rUeId
                    >
                    > p-a-c-k
                    > a
                    > g#e#s  K(eryo lCeasl,c ualuatthi osncsa
                    > f
                    > f`o`l`d
                    > icnogm)p
                    > a├_──r adtoicos /=
                    >  ├─b─ aisnef_rsaa/l
                    > a│r y   /└─ ─ cpoomspt_gbraensd/_mmiigdr
                    > a
                    > tmieornist/_
                    > i├n──c rdeoacskee r=- cfo(mppeorsfeo.rymmaln
                    > c├─e─ _praactkiangge,. jcsoomnp a _ r a t i←o )n
                    > p m  lwoowrekrs pcaocmepsa  rroaotti o( w=o rhkisgphaecre ss:u g[g"easptpesd/ *i"n]c)r
                    > e├─a─ stes
                    > c o nhfiiggh.ebra sceo.mjpsao nr
                    > a└t──i oe s=l ilnotw.ecro nsfuiggg.ejsst
                    > e`d` `i
                    > n
                    > c-r-e-a
                    > s
                    > e#
                    > #
                    >  bToencuhs _Sptaaycoku
                    > t
                    >  *=* Rboaoste _/s aTloaorlyi n*g *t*a
                    > r-g entp_mb ownoursk_sppcatc e*s  p(emrofnoorrmeapnoc)e
                    > _-m uTlytpiepSlcireirp
                    > t
                    >  b5u.d6g
                    > e-t _EcSoLnisnutm e9d  +=  PSrUeMt(tnieewr_
                    > s-a lVairtye s-t  b(atsees_tsianlga)r
                    > y
                    > )* *faoprp sa/lalp ie*l*i g— iNboldee .ejmsp lboaycekeesn
                    > d`
                    > `-`
                    > E
                    > x-p-r-e
                    > s
                    > s# #4 ,C oZdoidn g( vCaolnivdeanttiioonn)s,
                    >
                    > T-y pmeeSrcirti-pbto nvuisa/ :t sPxl
                    > a
                    > i*n* aJpSp s— /nwoe bb*u*i l— dE xsptreeps,s /nToy pbeuSncdrlieprt,  sneor vferra
                    > m-e wEoxrpkr
                    > e-s sa p4p,s /Z:o dT,y ptesSxc,r iVpitt essttr,i cStu pmeordtee,s tE
                    > S
                    > M* *mmoedruilte-sb,o nZuosd/ *f*o r—  vtahlei daacttiiovne
                    >  -c oPmrpe tptliaenrn ienngf oUrIc
                    > e-d  Vaacnriolslsa  tHhTeM Lr e+p oC S(Sn p+m  JrSu n( nfoo rfmraatm)e
                    > w-o rEkS,L innot  beuniflodr csetde p()n
                    > p-m  lroucna llSitnotr)a
                    > g-e  Tfeosrt sd avtiaa  pVeirtseisstt e(nncpem
                    >  -r uCnS Vt eismtp)o
                    > r-t  Dvoi an oitm pmoirxt .vhatnmill
                    > l-a  LJiSv ep abtutdegrents  mienttroi casp
                    > p
                    > s>/  NToytpee:S cTrhieprte  ciosd en
                    > o-  RKeeaecpt /fViiltees  fsrmoanltle nadn dy esti.n gTlhee- pwuorrpkoisneg
                    >
                    > U-I- -i
                    > s
                    >  #i#n  Cmoemrmiatn-dbso
                    > n
                    > u`s`/`
                    > ansp mp lrauinn  dHeTvM L   f i l e s .#
                    >
                    > d-e-v-
                    > a
                    > l#l#  wAocrtkisvpea cFeesa
                    > tnuprme sr u(nm ebruiitl-db o n u s / )#
                    >
                    > b-u i*l*dE maplllo yweoer krsopsatceers*
                    > *n p(me mrpulno yleienst. h t m l )   — #a dldi/netd ietv eermyptlhoiynege
                    > sn,p mC SrVu ni mfpoorrmta
                    > t-   * * M e#r ifto rpmlaatn neivnegr*y*t h(imnegr
                    > intp.mh trmuln)  t—y pmeecrhietc ki n c#r etayspeesc hweictkh  asltla twuosr ktsrpaacckeisn
                    > gn
                    > p-m  *r*uAnd mtiens*t*   ( a d m i n#. httemslt)  a— ltle awmo-rbkasspeadc emse
                    > r`i`t`
                    > a
                    > nmde rbiotn-ubso nbuusd/g e— toipnegn,  HfTiMnLa nfciel emso dduilree
                    > c-t l*y* Eixne cburtoiwvsee rv,i enwo* *b u(ielxde csutteipv en.ehetdmeld)
                    >
                    > — -s-u-m
                    > m
                    > a#r#y  Oduats hobfo aSrcdo
                    > p-e  *(*dCoS Vn oitm pbouritl*d*  y(eitm)p
                    > o
                    > r-t .Rhetamclt)/ V—i tuep lforaodn teemnpdl omyieger adtaitoan
                    
                    -- -E-q
                    u
                    i#t#y  D/a tRaS UL apylearn
                    n
                    i-n gE
                    m-p lHoRyIeSe  idnatteag rsattoiroends  i(nW o*r*kldoacya,l SBtaomrbaogoeH*R*,  (entoc .b)a
                    c-k eAnudt hpeenrtsiicsatteinocne  /y elto)g
                    i-n  C(SsVc aifmfpoolrdti nagv aeixliasbtlse  ivni ap aicmkpaogrets./h tbmult
                     -n oatp pasc/taipvie )+
                     -P oFsutlglr ebsa ciknefnrda spterruscitsutreen ceex i(sPtoss tbgurte sn oitn fyreat  ewxiirsetds  tbou tt hUeI  UsIt
                    i
                    l-l- -u
                    s
                    e#s#  lKoecya lCSatlocrualgaet)i
                    o
                    n-s-
                    -

                    `
                    `#`#
                     cWohmapta _Crlaatuidoe  =S hboausled_ sNaOlTa rDyo
                    /
                     -c oDmop _nboatn dr_umni dn
                    p
                    mm eirnistt_ailnlc roera smeo d=i ffy( pdeerpfeonrdmeanncciee_sr awtiitnhgo,u tc obmepian_gr aatsikoe)d

                     -  lDoow enro tc ormepfaa crtaotri om e=r ihti-gbhoenru ss/u gtgoe sRteeadc ti nucnrleeassse
                     -  e x phliigchietrl yc oamspkae dr
                     -  a-t iDoo  =n olto wteoru cshu gignefsrtae/dp oisntcgrreeass/em
                     -  i
                     -  gbroantuiso_npsa ywoiutth o=u tb aesxep_lsiacliatr yi n*s ttraurcgteito_nb
                     -  o-n uDso_ pncott  *a dpde raf obrumialndc es_tmeupl ttiop lmieerri
                     -  t
                     -  -bbuodnguest/_ c— oints uimse di n=t eSnUtMi(onneawl_lsya lpalrayi n-  HbTaMsLe/_JsSa
                     -  l-a rDyo)  nfootr  raelnla meel iogri brleeo regmapnliozyee efsi
                     -  l`e`s`
                     -  w
                     -  i-t-h-o
                     -  u
                     -  t# #a sCkoidnign gf iCrosntv
                     -  e-n tDioo nnso
                     -  t
                     -   -a dmde rfieta-tbuorneuss /o:u tPsliadien  cJuSr r— ennot  bpuhialsde  sstceopp,e no bundler, no framework
                     -   - apps/: TypeScript strict mode, ESM modules, Zod for validation
                         - - Prettier enforced across the repo (npm run format)
                           - - ESLint enforced (npm run lint)
                             - - Tests via Vitest (npm run test)
                               - - Do not mix vanilla JS patterns into apps/ TypeScript code
                                 - - Keep files small and single-purpose
                                  
                                   - ---

                                   ## Commands

                                   ```
                                   npm run dev        # dev all workspaces
                                   npm run build      # build all workspaces
                                   npm run lint       # lint everything
                                   npm run format     # format everything
                                   npm run typecheck  # typecheck all workspaces
                                   npm run test       # test all workspaces
                                   ```

                                   merit-bonus/ — open HTML files directly in browser, no build step needed

                                   ---


                                           ## What Claude Should NOT Do

                                           - Do not run npm install or modify dependencies without being asked
                                             - - Do not touch infra/postgres/migrations without explicit instruction
                                               - - Do not add a build step to merit-bonus/ — it is intentionally plain HTML/JS
                                                 - - Do not rename or reorganize files without asking first
                                                   - - Do not add features outside current phase scope
