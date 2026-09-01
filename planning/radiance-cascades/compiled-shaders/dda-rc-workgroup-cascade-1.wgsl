// Three.js r185 - Node System

// directives


// system
var<private> instanceIndex : u32;

// locals


// structs


// uniforms
@binding( 2 ) @group( 0 ) var nodeUniform7 : texture_2d<f32>;
@binding( 3 ) @group( 0 ) var nodeUniform8 : texture_2d<f32>;
@binding( 4 ) @group( 0 ) var nodeUniform9_sampler : sampler;
@binding( 5 ) @group( 0 ) var nodeUniform9 : texture_2d<f32>;
@binding( 6 ) @group( 0 ) var nodeUniform11 : texture_storage_2d<rgba8unorm, write>;

struct NodeBuffer_10379Struct {
	value : array< atomic<u32> >
};
@binding( 0 ) @group( 0 )
var<storage, read_write> NodeBuffer_10379 : NodeBuffer_10379Struct;

struct objectStruct {
	nodeUniform1 : vec2<f32>,
	nodeUniform2 : f32,
	nodeUniform3 : vec2<f32>,
	nodeUniform4 : f32,
	nodeUniform5 : vec2<f32>,
	nodeUniform6 : vec2<f32>,
	nodeUniform10 : f32,
	nodeUniform12 : f32
};
@binding( 1 ) @group( 0 )
var<uniform> object : objectStruct;

// vars
var<private> rcAtomicJobIndex : u32;
var<private> nodeVar0 : f32;
var<private> nodeVar1 : vec3<f32>;
var<private> nodeVar2 : f32;
var<private> nodeVar3 : f32;
var<private> nodeVar4 : f32;
var<private> nodeVar5 : vec2<f32>;
var<private> nodeVar6 : bool;
var<private> nodeVar7 : vec2<f32>;
var<private> nodeVar8 : bool;
var<private> nodeVar9 : f32;
var<private> nodeVar10 : f32;
var<private> nodeVar11 : vec2<f32>;
var<private> nodeVar12 : vec2<f32>;
var<private> nodeVar13 : vec2<f32>;
var<private> nodeVar14 : i32;
var<private> nodeVar15 : i32;
var<private> nodeVar16 : i32;
var<private> nodeVar17 : i32;
var<private> nodeVar18 : vec2<i32>;
var<private> nodeVar19 : f32;
var<private> nodeVar20 : f32;
var<private> nodeVar21 : i32;
var<private> nodeVar22 : i32;
var<private> nodeVar23 : i32;
var<private> nodeVar24 : i32;
var<private> nodeVar25 : i32;
var<private> nodeVar26 : i32;
var<private> nodeVar27 : vec2<i32>;
var<private> nodeVar28 : vec3<f32>;
var<private> nodeVar29 : f32;
var<private> nodeVar30 : f32;
var<private> nodeVar31 : f32;
var<private> nodeVar32 : f32;
var<private> nodeVar33 : f32;
var<private> nodeVar34 : i32;
var<private> nodeVar35 : i32;
var<private> nodeVar36 : i32;
var<private> nodeVar37 : i32;
var<private> nodeVar38 : i32;
var<private> nodeVar39 : i32;
var<private> nodeVar40 : vec4<f32>;
var<private> nodeVar41 : i32;
var<private> nodeVar42 : i32;
var<private> nodeVar43 : i32;
var<private> nodeVar44 : i32;
var<private> nodeVar45 : i32;
var<private> nodeVar46 : i32;
var<private> nodeVar47 : i32;
var<private> nodeVar48 : i32;
var<private> nodeVar49 : i32;
var<private> nodeVar50 : i32;
var<private> nodeVar51 : i32;
var<private> nodeVar52 : i32;
var<private> nodeVar53 : i32;
var<private> nodeVar54 : vec4<f32>;
var<private> nodeVar55 : f32;
var<private> nodeVar56 : f32;
var<private> nodeVar57 : f32;
var<private> nodeVar58 : vec4<f32>;
var<private> nodeVar59 : i32;
var<private> nodeVar60 : f32;
var<private> nodeVar61 : i32;
var<private> nodeVar62 : i32;
var<private> nodeVar63 : i32;
var<private> nodeVar64 : i32;
var<private> nodeVar65 : i32;
var<private> nodeVar66 : i32;
var<private> nodeVar67 : vec4<f32>;
var<private> nodeVar68 : f32;
var<private> nodeVar69 : f32;
var<private> nodeVar70 : f32;
var<private> nodeVar71 : i32;
var<private> nodeVar72 : i32;
var<private> nodeVar73 : i32;
var<private> nodeVar74 : i32;
var<private> nodeVar75 : i32;
var<private> nodeVar76 : i32;
var<private> nodeVar77 : vec4<f32>;
var<private> nodeVar78 : f32;
var<private> nodeVar79 : f32;
var<private> nodeVar80 : f32;
var<private> nodeVar81 : vec3<f32>;
var<private> nodeVar82 : vec3<f32>;
var<private> nodeVar83 : vec4<f32>;
var<private> nodeVar84 : vec4<f32>;
var<private> nodeVar85 : vec3<f32>;
var<private> nodeVar86 : vec4<f32>;
var<private> nodeVar87 : f32;
var<private> nodeVar88 : f32;
var<private> nodeVar89 : vec3<f32>;
var<private> nodeVar90 : f32;
var<private> nodeVar91 : vec3<f32>;
var<private> nodeVar92 : f32;
var<private> nodeVar93 : f32;
var<private> nodeVar94 : vec2<f32>;
var<private> nodeVar95 : vec4<f32>;
var<private> nodeVar96 : vec4<f32>;
var<private> nodeVar97 : f32;
var<private> nodeVar98 : vec4<f32>;
var<private> nodeVar99 : vec4<f32>;
var<private> nodeVar100 : f32;
var<private> nodeVar101 : vec4<f32>;
var<private> nodeVar102 : vec4<f32>;
var<private> nodeVar103 : f32;
var<private> nodeVar104 : vec4<f32>;
var<private> nodeVar105 : vec4<f32>;
var<private> nodeVar106 : vec4<f32>;

// codes
fn tsl_mod_vec2( x : vec2f, y : vec2f ) -> vec2f { return x - y * floor( x / y ); }
fn tsl_mod_float( x : f32, y : f32 ) -> f32 { return x - y * floor( x / y ); }


@compute @workgroup_size( 64, 1, 1 )
fn main( @builtin( global_invocation_id ) globalId : vec3<u32>,
	@builtin( workgroup_id ) workgroupId : vec3<u32>,
	@builtin( local_invocation_id ) localId : vec3<u32>,
	@builtin( num_workgroups ) numWorkgroups : vec3<u32> ) {

	// local vars


	// system
	instanceIndex = globalId.x
		+ globalId.y * ( 64 * numWorkgroups.x )
		+ globalId.z * ( 64 * numWorkgroups.x ) * ( 1 * numWorkgroups.y );

	// flow
	// code


	// flow -> dda-workgroup-cascade-1

	for ( var i : i32 = 0; i < 70; i ++ ) {

		let nodeConst0 = atomicAdd( &NodeBuffer_10379.value[ 0u ], 1u );
		rcAtomicJobIndex = nodeConst0;

		if ( ( rcAtomicJobIndex >= 279552u ) ) {

			break;


		}

		let rcComputeAtlasCell = vec2<i32>( i32( ( rcAtomicJobIndex % 672u ) ), i32( ( rcAtomicJobIndex / 672u ) ) );
		let rcFragCoord = ( vec2<f32>( rcComputeAtlasCell ) + vec2<f32>( 0.5 ) );
		let rcProbeGroupSize = vec2<f32>( 84.0, 52.0 );
		let rcRayXY = floor( ( rcFragCoord / rcProbeGroupSize ) );
		let rcProbeXY = tsl_mod_vec2( rcFragCoord, rcProbeGroupSize );
		let rcRayIndex = ( rcRayXY.x + ( rcRayXY.y * 8.0 ) );
		let rcActiveProbeXY = clamp( rcProbeXY, vec2<f32>( 0.5, 0.5 ), vec2<f32>( 83.5, 48.5 ) );
		let rcProbeUV = clamp( ( ( rcActiveProbeXY * vec2<f32>( 2.0 ) ) / vec2<f32>( 168.0, 98.0 ) ), vec2<f32>( 0.0 ), vec2<f32>( 1.0 ) );
		let rcProbeLocalPos = ( rcProbeUV * object.nodeUniform1 );
		let rcTheta = ( ( rcRayIndex + 0.5 ) * 0.09817477042468103 );
		let rcRayDirection = vec2<f32>( cos( rcTheta ), sin( rcTheta ) );
		let rcSegmentStartLocal = ( rcProbeLocalPos + ( rcRayDirection * vec2<f32>( object.nodeUniform2 ) ) );
		let rcSegmentStart = ( rcSegmentStartLocal + object.nodeUniform3 );

		if ( ( 0.0 > 0.5 ) ) {

			nodeVar0 = object.nodeUniform4;

		} else {

			nodeVar0 = object.nodeUniform4;

		}

		let rcTraceLimit = nodeVar0;
		nodeVar1 = vec3<f32>( 0.0, 0.0, 0.0 );
		nodeVar2 = 1.0;
		nodeVar3 = 0.0;
		nodeVar4 = 0.0;
		nodeVar6 = ( abs( rcRayDirection.x ) < 0.000001 );
		nodeVar7 = ( object.nodeUniform5 + object.nodeUniform6 );
		nodeVar8 = ( abs( rcRayDirection.y ) < 0.000001 );

		if ( ( ( nodeVar6 && ( ( rcSegmentStart.x < object.nodeUniform5.x ) || ( rcSegmentStart.x > nodeVar7.x ) ) ) || ( nodeVar8 && ( ( rcSegmentStart.y < object.nodeUniform5.y ) || ( rcSegmentStart.y > nodeVar7.y ) ) ) ) ) {

			nodeVar5 = vec2<f32>( 1.0, -1.0 );

		} else {


			if ( nodeVar6 ) {

				nodeVar9 = 0.000001;

			} else {

				nodeVar9 = rcRayDirection.x;

			}


			if ( nodeVar8 ) {

				nodeVar10 = 0.000001;

			} else {

				nodeVar10 = rcRayDirection.y;

			}

			nodeVar11 = ( vec2<f32>( 1.0 ) / vec2<f32>( nodeVar9, nodeVar10 ) );
			nodeVar12 = ( ( object.nodeUniform5 - rcSegmentStart ) * nodeVar11 );
			nodeVar13 = ( ( nodeVar7 - rcSegmentStart ) * nodeVar11 );
			nodeVar5 = vec2<f32>( max( min( nodeVar12.x, nodeVar13.x ), min( nodeVar12.y, nodeVar13.y ) ), min( max( nodeVar12.x, nodeVar13.x ), max( nodeVar12.y, nodeVar13.y ) ) );

		}

		let rcBoundsInterval = nodeVar5;
		let rcTraceEntry = max( rcBoundsInterval.x, 0.0 );
		let rcTraceExit = min( rcBoundsInterval.y, rcTraceLimit );
		let rcIntersectsWorld = ( rcTraceExit >= rcTraceEntry );
		let nodeConst1 = vec2<f32>( 2.0, 2.0 );
		let nodeConst2 = 0.00196078431372549;
		let nodeConst3 = ( rcSegmentStart + ( rcRayDirection * vec2<f32>( rcTraceEntry ) ) );
		let nodeConst4 = clamp( ( ( nodeConst3 - object.nodeUniform5 ) / object.nodeUniform6 ), vec2<f32>( 0.0 ), vec2<f32>( 1.0 ) );
		let nodeConst5 = vec2<f32>( nodeConst4.x, ( 1.0 - nodeConst4.y ) );
		let nodeConst6 = clamp( ( nodeConst5 * nodeConst1 ), vec2<f32>( 0.0, 0.0 ), ( nodeConst1 - vec2<f32>( 0.0001 ) ) );
		let nodeConst7 = vec2<f32>( ( ( rcRayDirection.x / object.nodeUniform6.x ) * nodeConst1.x ), ( ( ( rcRayDirection.y / object.nodeUniform6.y ) * nodeConst1.y ) * -1.0 ) );
		let nodeConst8 = ( abs( nodeConst7.x ) < 1e-8 );
		let nodeConst9 = ( abs( nodeConst7.y ) < 1e-8 );

		if ( nodeConst8 ) {

			nodeVar14 = 0;

		} else {


			if ( ( nodeConst7.x > 0.0 ) ) {

				nodeVar15 = 1;

			} else {

				nodeVar15 = -1;

			}

			nodeVar14 = nodeVar15;

		}


		if ( nodeConst9 ) {

			nodeVar16 = 0;

		} else {


			if ( ( nodeConst7.y > 0.0 ) ) {

				nodeVar17 = 1;

			} else {

				nodeVar17 = -1;

			}

			nodeVar16 = nodeVar17;

		}

		let nodeConst10 = vec2<i32>( nodeVar14, nodeVar16 );
		let nodeConst11 = clamp( ( nodeConst6 + ( vec2<f32>( nodeConst10 ) * vec2<f32>( 0.00001 ) ) ), vec2<f32>( 0.0, 0.0 ), ( nodeConst1 - vec2<f32>( 0.0001 ) ) );
		nodeVar18 = vec2<i32>( i32( floor( nodeConst11.x ) ), i32( floor( nodeConst11.y ) ) );

		if ( ( nodeConst10.x > 0 ) ) {

			nodeVar19 = f32( ( nodeVar18.x + 1 ) );

		} else {

			nodeVar19 = f32( nodeVar18.x );

		}


		if ( ( nodeConst10.y > 0 ) ) {

			nodeVar20 = f32( ( nodeVar18.y + 1 ) );

		} else {

			nodeVar20 = f32( nodeVar18.y );

		}

		let nodeConst12 = vec2<f32>( nodeVar19, nodeVar20 );
		let nodeConst13 = i32( floor( ( ( clamp( ( 1.0 / abs( nodeConst7.x ) ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );
		let nodeConst14 = i32( floor( ( ( clamp( ( 1.0 / abs( nodeConst7.y ) ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );

		if ( ( nodeConst13 < 1 ) ) {

			nodeVar21 = 1;

		} else {

			nodeVar21 = nodeConst13;

		}

		let nodeConst15 = nodeVar21;

		if ( ( nodeConst14 < 1 ) ) {

			nodeVar22 = 1;

		} else {

			nodeVar22 = nodeConst14;

		}

		let nodeConst16 = nodeVar22;

		if ( nodeConst8 ) {

			nodeVar23 = 1073741823;

		} else {

			nodeVar23 = nodeConst15;

		}


		if ( nodeConst9 ) {

			nodeVar24 = 1073741823;

		} else {

			nodeVar24 = nodeConst16;

		}

		let nodeConst17 = vec2<i32>( nodeVar23, nodeVar24 );

		if ( nodeConst8 ) {

			nodeVar25 = 1073741823;

		} else {

			nodeVar25 = i32( floor( ( ( clamp( ( ( nodeConst12.x - nodeConst6.x ) / nodeConst7.x ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );

		}


		if ( nodeConst9 ) {

			nodeVar26 = 1073741823;

		} else {

			nodeVar26 = i32( floor( ( ( clamp( ( ( nodeConst12.y - nodeConst6.y ) / nodeConst7.y ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );

		}

		nodeVar27 = vec2<i32>( nodeVar25, nodeVar26 );
		let nodeConst18 = i32( floor( ( ( clamp( max( ( rcTraceExit - rcTraceEntry ), 0.0 ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );
		nodeVar28 = vec3<f32>( 0.0, 0.0, 0.0 );

		if ( ( ! rcIntersectsWorld ) ) {

			nodeVar29 = 1.0;

		} else {

			nodeVar29 = 0.0;

		}

		nodeVar30 = nodeVar29;

		if ( rcIntersectsWorld ) {

			nodeVar31 = 1.0;

		} else {

			nodeVar31 = 0.0;

		}

		nodeVar32 = nodeVar31;
		nodeVar33 = 0.0;

		if ( rcIntersectsWorld ) {


			for ( var i : i32 = 0; i < 4; i ++ ) {

				nodeVar35 = ( nodeVar18.x >> 1u );

				if ( ( nodeVar35 < 0 ) ) {

					nodeVar34 = 0;

				} else {


					if ( ( nodeVar35 > 0 ) ) {

						nodeVar36 = 0;

					} else {

						nodeVar36 = nodeVar35;

					}

					nodeVar34 = nodeVar36;

				}

				nodeVar38 = ( nodeVar18.y >> 1u );

				if ( ( nodeVar38 < 0 ) ) {

					nodeVar37 = 0;

				} else {


					if ( ( nodeVar38 > 0 ) ) {

						nodeVar39 = 0;

					} else {

						nodeVar39 = nodeVar38;

					}

					nodeVar37 = nodeVar39;

				}

				let nodeConst19 = vec2<i32>( nodeVar34, nodeVar37 );
				nodeVar40 = textureLoad( nodeUniform7, nodeConst19, u32( 0u ) );
				let nodeConst20 = nodeVar40.xyz;
				let nodeConst21 = nodeConst20;
				let nodeConst22 = ( ( ( ( ( nodeConst21.x < nodeConst2 ) && ( nodeConst21.y < nodeConst2 ) ) && ( nodeConst21.z < nodeConst2 ) ) && ( nodeVar32 < 0.5 ) ) && ( nodeVar33 < 0.5 ) );

				if ( nodeConst22 ) {

					let nodeConst23 = ( nodeVar18.x & 1 );
					let nodeConst24 = ( nodeVar18.y & 1 );

					if ( ( nodeConst10.x > 0 ) ) {

						nodeVar41 = ( 2 - nodeConst23 );

					} else {

						nodeVar41 = ( nodeConst23 + 1 );

					}

					let nodeConst25 = nodeVar41;

					if ( ( nodeConst10.y > 0 ) ) {

						nodeVar42 = ( 2 - nodeConst24 );

					} else {

						nodeVar42 = ( nodeConst24 + 1 );

					}

					let nodeConst26 = nodeVar42;

					if ( nodeConst8 ) {

						nodeVar43 = 1073741823;

					} else {

						nodeVar43 = ( nodeVar27.x + ( nodeConst17.x * ( nodeConst25 - 1 ) ) );

					}

					let nodeConst27 = nodeVar43;

					if ( nodeConst9 ) {

						nodeVar44 = 1073741823;

					} else {

						nodeVar44 = ( nodeVar27.y + ( nodeConst17.y * ( nodeConst26 - 1 ) ) );

					}

					let nodeConst28 = nodeVar44;
					let nodeConst29 = ( abs( ( nodeConst27 - nodeConst28 ) ) <= 1 );

					if ( ( ! nodeConst29 ) ) {


						if ( ( nodeConst27 < nodeConst28 ) ) {

							nodeVar45 = nodeConst27;

						} else {

							nodeVar45 = nodeConst28;

						}

						let nodeConst30 = nodeVar45;

						if ( ( nodeConst30 >= nodeConst18 ) ) {

							nodeVar30 = 1.0;
							break;


						}


						if ( ( nodeConst27 < nodeConst28 ) ) {


							if ( ( nodeVar27.y <= nodeConst30 ) ) {

								nodeVar46 = ( ( ( nodeConst30 - nodeVar27.y ) / nodeConst17.y ) + 1 );

							} else {

								nodeVar46 = 0;

							}

							let nodeConst31 = nodeVar46;
							nodeVar18.x = ( nodeVar18.x + ( nodeConst10.x * nodeConst25 ) );
							nodeVar18.y = ( nodeVar18.y + ( nodeConst10.y * nodeConst31 ) );
							nodeVar27.x = ( nodeVar27.x + ( nodeConst17.x * nodeConst25 ) );
							nodeVar27.y = ( nodeVar27.y + ( nodeConst17.y * nodeConst31 ) );
							continue;


						} else {


							if ( ( nodeVar27.x <= nodeConst30 ) ) {

								nodeVar47 = ( ( ( nodeConst30 - nodeVar27.x ) / nodeConst17.x ) + 1 );

							} else {

								nodeVar47 = 0;

							}

							let nodeConst32 = nodeVar47;
							nodeVar18.x = ( nodeVar18.x + ( nodeConst10.x * nodeConst32 ) );
							nodeVar18.y = ( nodeVar18.y + ( nodeConst10.y * nodeConst26 ) );
							nodeVar27.x = ( nodeVar27.x + ( nodeConst17.x * nodeConst32 ) );
							nodeVar27.y = ( nodeVar27.y + ( nodeConst17.y * nodeConst26 ) );
							continue;


						}



					}



				}

				nodeVar49 = ( nodeVar18.x >> 1u );

				if ( ( nodeVar49 < 0 ) ) {

					nodeVar48 = 0;

				} else {


					if ( ( nodeVar49 > 0 ) ) {

						nodeVar50 = 0;

					} else {

						nodeVar50 = nodeVar49;

					}

					nodeVar48 = nodeVar50;

				}

				nodeVar52 = ( nodeVar18.y >> 1u );

				if ( ( nodeVar52 < 0 ) ) {

					nodeVar51 = 0;

				} else {


					if ( ( nodeVar52 > 0 ) ) {

						nodeVar53 = 0;

					} else {

						nodeVar53 = nodeVar52;

					}

					nodeVar51 = nodeVar53;

				}

				let nodeConst33 = vec2<i32>( nodeVar48, nodeVar51 );
				nodeVar54 = textureLoad( nodeUniform7, nodeConst33, u32( 0u ) );
				let nodeConst34 = nodeVar54.xyz;
				let nodeConst35 = u32( floor( ( ( nodeConst34.x * 255.0 ) + 0.5 ) ) );
				let nodeConst36 = u32( floor( ( ( nodeConst34.y * 255.0 ) + 0.5 ) ) );
				let nodeConst37 = u32( floor( ( ( nodeConst34.z * 255.0 ) + 0.5 ) ) );
				let nodeConst38 = u32( ( ( nodeVar18.x & 1 ) + ( ( nodeVar18.y & 1 ) * 2 ) ) );
				let nodeConst39 = ( 1u << nodeConst38 );

				if ( ( ( nodeConst35 & nodeConst39 ) > 0u ) ) {

					nodeVar55 = 1.0;

				} else {

					nodeVar55 = 0.0;

				}


				if ( ( ( nodeConst36 & nodeConst39 ) > 0u ) ) {

					nodeVar56 = 1.0;

				} else {

					nodeVar56 = 0.0;

				}


				if ( ( ( nodeConst37 & nodeConst39 ) > 0u ) ) {

					nodeVar57 = 1.0;

				} else {

					nodeVar57 = 0.0;

				}

				let nodeConst40 = vec3<f32>( nodeVar55, nodeVar56, nodeVar57 );

				if ( ( nodeConst40.z > 0.5 ) ) {

					nodeVar58 = textureLoad( nodeUniform8, nodeVar18, u32( 0u ) );
					let nodeConst41 = nodeVar58.xyz;

					if ( ( dot( nodeConst41, nodeConst41 ) > 1e-10 ) ) {

						nodeVar28 = nodeConst41;
						nodeVar30 = 2.0;
						break;


					}



				}

				let nodeConst42 = ( nodeConst40.x > 0.5 );
				let nodeConst43 = ( nodeConst40.y > 0.5 );

				if ( ( ( nodeVar32 > 0.5 ) && ( ! nodeConst42 ) ) ) {

					nodeVar32 = 0.0;


				}

				let nodeConst44 = ( nodeVar32 < 0.5 );

				if ( ( ( nodeConst44 && ( nodeVar33 > 0.5 ) ) && ( ! nodeConst43 ) ) ) {

					nodeVar30 = -1.0;
					break;


				}


				if ( ( ( nodeConst44 && nodeConst42 ) && ( ! nodeConst43 ) ) ) {

					nodeVar30 = -1.0;
					break;


				}


				if ( ( nodeConst44 && nodeConst43 ) ) {

					nodeVar33 = 1.0;


				}


				if ( ( nodeVar27.x < nodeVar27.y ) ) {

					nodeVar59 = nodeVar27.x;

				} else {

					nodeVar59 = nodeVar27.y;

				}

				let nodeConst45 = nodeVar59;

				if ( ( nodeConst45 >= nodeConst18 ) ) {


					if ( ( nodeVar33 > 0.5 ) ) {

						nodeVar60 = -1.0;

					} else {

						nodeVar60 = 1.0;

					}

					nodeVar30 = nodeVar60;
					break;


				}

				let nodeConst46 = ( abs( ( nodeVar27.x - nodeVar27.y ) ) <= 1 );
				let nodeConst47 = ( ( ! nodeConst46 ) && ( nodeVar27.x < nodeVar27.y ) );
				let nodeConst48 = ( ( ! nodeConst46 ) && ( nodeVar27.y < nodeVar27.x ) );

				if ( nodeConst46 ) {

					let nodeConst49 = vec2<i32>( ( nodeVar18.x + nodeConst10.x ), nodeVar18.y );
					let nodeConst50 = vec2<i32>( nodeVar18.x, ( nodeVar18.y + nodeConst10.y ) );
					nodeVar62 = ( nodeConst49.x >> 1u );

					if ( ( nodeVar62 < 0 ) ) {

						nodeVar61 = 0;

					} else {


						if ( ( nodeVar62 > 0 ) ) {

							nodeVar63 = 0;

						} else {

							nodeVar63 = nodeVar62;

						}

						nodeVar61 = nodeVar63;

					}

					nodeVar65 = ( nodeConst49.y >> 1u );

					if ( ( nodeVar65 < 0 ) ) {

						nodeVar64 = 0;

					} else {


						if ( ( nodeVar65 > 0 ) ) {

							nodeVar66 = 0;

						} else {

							nodeVar66 = nodeVar65;

						}

						nodeVar64 = nodeVar66;

					}

					let nodeConst51 = vec2<i32>( nodeVar61, nodeVar64 );
					nodeVar67 = textureLoad( nodeUniform7, nodeConst51, u32( 0u ) );
					let nodeConst52 = nodeVar67.xyz;
					let nodeConst53 = u32( floor( ( ( nodeConst52.x * 255.0 ) + 0.5 ) ) );
					let nodeConst54 = u32( floor( ( ( nodeConst52.y * 255.0 ) + 0.5 ) ) );
					let nodeConst55 = u32( floor( ( ( nodeConst52.z * 255.0 ) + 0.5 ) ) );
					let nodeConst56 = u32( ( ( nodeConst49.x & 1 ) + ( ( nodeConst49.y & 1 ) * 2 ) ) );
					let nodeConst57 = ( 1u << nodeConst56 );

					if ( ( ( nodeConst53 & nodeConst57 ) > 0u ) ) {

						nodeVar68 = 1.0;

					} else {

						nodeVar68 = 0.0;

					}


					if ( ( ( nodeConst54 & nodeConst57 ) > 0u ) ) {

						nodeVar69 = 1.0;

					} else {

						nodeVar69 = 0.0;

					}


					if ( ( ( nodeConst55 & nodeConst57 ) > 0u ) ) {

						nodeVar70 = 1.0;

					} else {

						nodeVar70 = 0.0;

					}

					let nodeConst58 = vec3<f32>( nodeVar68, nodeVar69, nodeVar70 );
					nodeVar72 = ( nodeConst50.x >> 1u );

					if ( ( nodeVar72 < 0 ) ) {

						nodeVar71 = 0;

					} else {


						if ( ( nodeVar72 > 0 ) ) {

							nodeVar73 = 0;

						} else {

							nodeVar73 = nodeVar72;

						}

						nodeVar71 = nodeVar73;

					}

					nodeVar75 = ( nodeConst50.y >> 1u );

					if ( ( nodeVar75 < 0 ) ) {

						nodeVar74 = 0;

					} else {


						if ( ( nodeVar75 > 0 ) ) {

							nodeVar76 = 0;

						} else {

							nodeVar76 = nodeVar75;

						}

						nodeVar74 = nodeVar76;

					}

					let nodeConst59 = vec2<i32>( nodeVar71, nodeVar74 );
					nodeVar77 = textureLoad( nodeUniform7, nodeConst59, u32( 0u ) );
					let nodeConst60 = nodeVar77.xyz;
					let nodeConst61 = u32( floor( ( ( nodeConst60.x * 255.0 ) + 0.5 ) ) );
					let nodeConst62 = u32( floor( ( ( nodeConst60.y * 255.0 ) + 0.5 ) ) );
					let nodeConst63 = u32( floor( ( ( nodeConst60.z * 255.0 ) + 0.5 ) ) );
					let nodeConst64 = u32( ( ( nodeConst50.x & 1 ) + ( ( nodeConst50.y & 1 ) * 2 ) ) );
					let nodeConst65 = ( 1u << nodeConst64 );

					if ( ( ( nodeConst61 & nodeConst65 ) > 0u ) ) {

						nodeVar78 = 1.0;

					} else {

						nodeVar78 = 0.0;

					}


					if ( ( ( nodeConst62 & nodeConst65 ) > 0u ) ) {

						nodeVar79 = 1.0;

					} else {

						nodeVar79 = 0.0;

					}


					if ( ( ( nodeConst63 & nodeConst65 ) > 0u ) ) {

						nodeVar80 = 1.0;

					} else {

						nodeVar80 = 0.0;

					}

					let nodeConst66 = vec3<f32>( nodeVar78, nodeVar79, nodeVar80 );
					nodeVar81 = vec3<f32>( 0.0, 0.0, 0.0 );
					nodeVar82 = vec3<f32>( 0.0, 0.0, 0.0 );

					if ( ( nodeConst58.z > 0.5 ) ) {

						nodeVar83 = textureLoad( nodeUniform8, nodeConst49, u32( 0u ) );
						let nodeConst67 = nodeVar83.xyz;
						nodeVar81 = nodeConst67;


					}


					if ( ( nodeConst66.z > 0.5 ) ) {

						nodeVar84 = textureLoad( nodeUniform8, nodeConst50, u32( 0u ) );
						let nodeConst68 = nodeVar84.xyz;
						nodeVar82 = nodeConst68;


					}


					if ( ( dot( nodeVar81, nodeVar81 ) > dot( nodeVar82, nodeVar82 ) ) ) {

						nodeVar85 = nodeVar81;

					} else {

						nodeVar85 = nodeVar82;

					}


					if ( ( dot( nodeVar85, nodeVar85 ) > 1e-10 ) ) {

						nodeVar28 = nodeVar85;
						nodeVar30 = 2.0;
						break;


					}

					let nodeConst69 = ( nodeConst58.y > 0.5 );
					let nodeConst70 = ( nodeConst66.y > 0.5 );
					let nodeConst71 = ( ( nodeConst58.x > 0.5 ) && ( ! nodeConst69 ) );
					let nodeConst72 = ( ( nodeConst66.x > 0.5 ) && ( ! nodeConst70 ) );
					let nodeConst73 = ( nodeVar32 < 0.5 );

					if ( ( nodeConst73 && ( nodeConst71 || nodeConst72 ) ) ) {

						nodeVar30 = -1.0;
						break;


					}


					if ( ( nodeConst73 && ( nodeConst69 || nodeConst70 ) ) ) {

						nodeVar33 = 1.0;


					}


					if ( ( ( nodeConst73 && ( nodeVar33 > 0.5 ) ) && ( ! ( nodeConst69 || nodeConst70 ) ) ) ) {

						nodeVar30 = -1.0;
						break;


					}

					nodeVar18.x = ( nodeVar18.x + nodeConst10.x );
					nodeVar18.y = ( nodeVar18.y + nodeConst10.y );
					nodeVar27.x = ( nodeVar27.x + nodeConst17.x );
					nodeVar27.y = ( nodeVar27.y + nodeConst17.y );


				}


				if ( nodeConst47 ) {

					nodeVar18.x = ( nodeVar18.x + nodeConst10.x );
					nodeVar27.x = ( nodeVar27.x + nodeConst17.x );


				}


				if ( nodeConst48 ) {

					nodeVar18.y = ( nodeVar18.y + nodeConst10.y );
					nodeVar27.y = ( nodeVar27.y + nodeConst17.y );


				}


			}



		}

		nodeVar86 = vec4<f32>( nodeVar28, nodeVar30 );
		nodeVar1 = nodeVar86.xyz;

		if ( ( ( nodeVar86.w < -0.5 ) || ( nodeVar86.w > 1.5 ) ) ) {

			nodeVar87 = 0.0;

		} else {

			nodeVar87 = 1.0;

		}

		nodeVar2 = nodeVar87;

		if ( ( ( nodeVar86.w > 0.5 ) && ( nodeVar86.w < 1.5 ) ) ) {

			nodeVar88 = 1.0;

		} else {

			nodeVar88 = 0.0;

		}

		nodeVar4 = nodeVar88;

		if ( ( ( ( nodeVar2 > 0.5 ) && ( nodeVar4 > 0.5 ) ) && ( 0.0 > 0.5 ) ) ) {

			nodeVar1 = vec3<f32>( 0.0, 0.0, 0.0 );
			nodeVar2 = 0.0;


		}

		nodeVar89 = nodeVar1;
		nodeVar90 = nodeVar2;

		if ( ( nodeVar2 > 0.0 ) ) {

			nodeVar91 = vec3<f32>( 0.0, 0.0, 0.0 );
			nodeVar92 = 0.0;
			nodeVar93 = ( ( rcRayIndex * 4.0 ) + 0.0 );
			nodeVar94 = clamp( ( rcProbeXY * vec2<f32>( 0.5 ) ), vec2<f32>( 0.5, 0.5 ), vec2<f32>( 41.5, 24.5 ) );
			nodeVar95 = textureSampleLevel( nodeUniform9, nodeUniform9_sampler, ( ( ( vec2<f32>( tsl_mod_float( nodeVar93, 16.0 ), floor( ( nodeVar93 / 16.0 ) ) ) * vec2<f32>( 42.0, 26.0 ) ) + nodeVar94 ) / vec2<f32>( 672.0, 416.0 ) ), 0.0 );
			nodeVar96 = vec4<f32>( ( nodeVar95.xyz * vec3<f32>( object.nodeUniform10 ) ), nodeVar95.w );
			nodeVar91 = ( nodeVar91 + nodeVar96.xyz );
			nodeVar92 = ( nodeVar92 + nodeVar96.w );
			nodeVar97 = ( ( rcRayIndex * 4.0 ) + 1.0 );
			nodeVar98 = textureSampleLevel( nodeUniform9, nodeUniform9_sampler, ( ( ( vec2<f32>( tsl_mod_float( nodeVar97, 16.0 ), floor( ( nodeVar97 / 16.0 ) ) ) * vec2<f32>( 42.0, 26.0 ) ) + nodeVar94 ) / vec2<f32>( 672.0, 416.0 ) ), 0.0 );
			nodeVar99 = vec4<f32>( ( nodeVar98.xyz * vec3<f32>( object.nodeUniform10 ) ), nodeVar98.w );
			nodeVar91 = ( nodeVar91 + nodeVar99.xyz );
			nodeVar92 = ( nodeVar92 + nodeVar99.w );
			nodeVar100 = ( ( rcRayIndex * 4.0 ) + 2.0 );
			nodeVar101 = textureSampleLevel( nodeUniform9, nodeUniform9_sampler, ( ( ( vec2<f32>( tsl_mod_float( nodeVar100, 16.0 ), floor( ( nodeVar100 / 16.0 ) ) ) * vec2<f32>( 42.0, 26.0 ) ) + nodeVar94 ) / vec2<f32>( 672.0, 416.0 ) ), 0.0 );
			nodeVar102 = vec4<f32>( ( nodeVar101.xyz * vec3<f32>( object.nodeUniform10 ) ), nodeVar101.w );
			nodeVar91 = ( nodeVar91 + nodeVar102.xyz );
			nodeVar92 = ( nodeVar92 + nodeVar102.w );
			nodeVar103 = ( ( rcRayIndex * 4.0 ) + 3.0 );
			nodeVar104 = textureSampleLevel( nodeUniform9, nodeUniform9_sampler, ( ( ( vec2<f32>( tsl_mod_float( nodeVar103, 16.0 ), floor( ( nodeVar103 / 16.0 ) ) ) * vec2<f32>( 42.0, 26.0 ) ) + nodeVar94 ) / vec2<f32>( 672.0, 416.0 ) ), 0.0 );
			nodeVar105 = vec4<f32>( ( nodeVar104.xyz * vec3<f32>( object.nodeUniform10 ) ), nodeVar104.w );
			nodeVar91 = ( nodeVar91 + nodeVar105.xyz );
			nodeVar92 = ( nodeVar92 + nodeVar105.w );
			nodeVar91 = ( nodeVar91 * vec3<f32>( 0.25 ) );
			nodeVar92 = ( nodeVar92 * 0.25 );
			nodeVar89 = ( nodeVar89 + ( vec3<f32>( nodeVar90 ) * nodeVar91 ) );
			nodeVar90 = ( nodeVar90 * nodeVar92 );


		}

		nodeVar106 = vec4<f32>( nodeVar89, nodeVar90 );
		textureStore( nodeUniform11, vec2<u32>( rcComputeAtlasCell ), vec4<f32>( ( floor( ( ( clamp( ( nodeVar106.xyz / vec3<f32>( object.nodeUniform10 ) ), vec3<f32>( 0.0 ), vec3<f32>( 1.0 ) ) * vec3<f32>( object.nodeUniform12 ) ) + vec3<f32>( 0.5 ) ) ) / vec3<f32>( object.nodeUniform12 ) ), ( floor( ( ( clamp( nodeVar106.w, 0.0, 1.0 ) * object.nodeUniform12 ) + 0.5 ) ) / object.nodeUniform12 ) ) );

	}




}
